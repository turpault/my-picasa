import { buildEmitter } from "../../shared/lib/event";
import { AlbumEntry, AlbumEntryPicasa } from "../../shared/types/types";
import { setupAutocolor } from "../features/autocolor";
import { setupBlur } from "../features/blur";
import { setupBrightness } from "../features/brightness";
import { setupBW } from "../features/bw";
import { setupContrast } from "../features/contrast";
import { setupCrop } from "../features/crop";
import { setupFlip } from "../features/flip";
import { setupGamma } from "../features/gamma";
import { setupMirror } from "../features/mirror";
import { setupPolaroid } from "../features/polaroid";
import { setupRotate } from "../features/rotate";
import { setupSepia } from "../features/sepia";
import { setupSharpen } from "../features/sharpen";
import { setupTilt } from "../features/tilt";
import { buildAlbumEntryEx } from "../folder-utils";
import { $, _$ } from "../lib/dom";
import { toggleStar } from "../lib/handles";
import { ImagePanZoomController } from "../lib/panzoom";
import { ActiveImageManager } from "../selection/active-manager";
import { AppEventSource } from "../uiTypes";
import { animateStar } from "./animations";
import { ImageController } from "./image-controller";
import { makeImageStrip } from "./image-strip";
import { deleteTabWin, makeGenericTab, TabEvent } from "./tabs";
import { make as makeTools } from "./tools";

const editHTML = `
<div class="fill">
  <div class="fill w3-bar-block tools">
    <div class="w3-bar-item editor-image-block">Description</div>
    <div>
      <input
        class="description w3-input"
        style="background: none"
        type="text"
      />
    </div>
    <div class="w3-bar-item editor-image-block">Actions</div>
    <div class="actions"></div>
    <div class="w3-bar-item editor-image-block">History</div>
    <div class="history w3-bar-item"></div>
  </div>

  <div class="image-container">
    <div    
      style="display: none"
      class="busy-spinner w3-display-container fill"
    >
      <img src="resources/images/thinking.gif" class="w3-display-middle" />
    </div>
    <video autoplay muted loop controls class="edited-video">
    </video>
    <img class="fill-with-aspect edited-image"></img>
  </div>
</div>`;

const toolsHTML = `
<div class="editor-bottom-tools">
  <div class="image-strip">
      <button
        class="previous-image fa fa-arrow-left editor-navigation-button"
        style="position: absolute; left: 0; top: 0"
      ></button>
      <button
        class="next-image fa fa-arrow-right editor-navigation-button"
        style="position: absolute; right: 0; top: 0"
      ></button>
      <div class="image-strip-thumbs"></div>
    </div>
    <div class="zoom-strip">  
      <label>Zoom</label>
    <input type="range" min="10" max="40" value="10" class="zoom-ctrl slider">
  </div>
</div>`;

export async function makeEditorPage(
  initialIndex: number,
  initialList: AlbumEntry[],
  appEvents: AppEventSource
): Promise<{ win: _$; tab: _$, tool: _$ }> {
  const editor = $(editHTML);

  const image = $(".edited-image", editor);
  const video = $(".edited-video", editor);
  const imageContainer = $(".image-container", editor);
  const tool = $(toolsHTML);

  const tabEvent = buildEmitter<TabEvent>();
  const tab = makeGenericTab(tabEvent);
  tabEvent.emit("rename", { name: initialList[initialIndex].name });
  appEvents.on("tabDisplayed", async (event) => {
    if (event.win.get() === editor.get()) {
      const zoomController = new ImagePanZoomController(image);
      const imageController = new ImageController(image, video, zoomController);
      const toolRegistrar = makeTools(editor, imageController);
      // Add all the activable features
      setupCrop(imageContainer, zoomController, imageController, toolRegistrar);
      setupTilt(imageContainer, zoomController, imageController, toolRegistrar);
      setupAutocolor(imageController, toolRegistrar);
      setupBW(imageController, toolRegistrar);
      setupContrast(imageController, toolRegistrar);
      setupGamma(imageController, toolRegistrar);
      setupBrightness(imageController, toolRegistrar);
      setupSepia(imageController, toolRegistrar);
      setupPolaroid(imageController, toolRegistrar);
      setupRotate(imageController, toolRegistrar);
      setupFlip(imageController, toolRegistrar);
      setupMirror(imageController, toolRegistrar);
      setupBlur(imageController, toolRegistrar);
      setupSharpen(imageController, toolRegistrar);

      const entries = await buildAlbumEntryEx(initialList);

      const activeManager = new ActiveImageManager(
        entries,
        entries[initialIndex]
      );
      makeImageStrip($(".image-strip", tool).get()!, activeManager);

      imageController.init(activeManager.active() as AlbumEntryPicasa);

      activeManager.event.on("changed", (event) => {
        imageController.display(event as AlbumEntryPicasa);
      });
      imageController.events.on("idle", () => {
        $(".busy-spinner", editor).css("display", "none");
      });
      imageController.events.on("busy", () => {
        $(".busy-spinner", editor).css("display", "block");
      });
      const off = [
        appEvents.on("keyDown", async ({ code, win }) => {
          if(win.get() === editor.get()) {
            switch (code) {
              case "Space":
                const target = await toggleStar([activeManager.active()]);
                animateStar(target);
                break;
              case "ArrowLeft":
                activeManager.selectPrevious();
                break;
              case "ArrowRight":
                activeManager.selectNext();
                break;
              case "Escape":
                deleteTabWin(win);
            }
          }
        }),
        appEvents.on("tabDeleted", ({ win }) => {
          if (win.get() === editor.get()) {
            off.forEach((o) => o());
          }
        }),
      ];
      const z = $(".zoom-ctrl", tool);
      z.on("input", () => {
        zoomController.zoom(z.val() / 10);
      });
      zoomController.events.on("zoom", (zoom) => {
        z.val(zoom.scale * 10);
      });

      activeManager.event.on("changed", (entry) => {
        tabEvent.emit("rename", { name: entry.name });
      });
    }
  });
  return { win: editor, tab, tool };
}
