import { buildEmitter } from "../../shared/lib/event";
import {
  AlbumEntry,
  AlbumEntryPicasa,
  JOBNAMES,
} from "../../shared/types/types";
import { setupAutocolor } from "../features/autocolor";
import { setupBlur } from "../features/blur";
import { setupBrightness } from "../features/brightness";
import { setupBW } from "../features/bw";
import { setupContrast } from "../features/contrast";
import { setupCrop } from "../features/crop";
import { setupFill } from "../features/fill";
import { setupFilters } from "../features/filter";
import { setupFlip } from "../features/flip";
import { setupMirror } from "../features/mirror";
import { setupPolaroid } from "../features/polaroid";
import { setupRotate } from "../features/rotate";
import { setupSepia } from "../features/sepia";
import { setupSharpen } from "../features/sharpen";
import { setupTilt } from "../features/tilt";
import { buildAlbumEntryEx } from "../folder-utils";
import { $ } from "../lib/dom";
import { toggleStar } from "../lib/handles";
import { ImagePanZoomController } from "../lib/panzoom";
import { getService } from "../rpc/connect";
import { ActiveImageManager } from "../selection/active-manager";
import { SelectionManager } from "../selection/selection-manager";
import { AppEventSource } from "../uiTypes";
import { ImageController } from "./image-controller";
import { makeImageStrip } from "./image-strip";
import { makeMetadata } from "./metadata";
import { t } from "./strings";
import { TabEvent, deleteTabWin, makeGenericTab } from "./tabs";
import { GENERAL_TOOL_TAB, make as makeTools } from "./tools";

import { idFromAlbumEntry } from "../../shared/lib/utils";
import { makeIdentify } from "./identify";

const editHTML = `
<div class="fill">
  <div class="fill w3-bar-block tools">
    <div style="display:none" class="collapsible w3-bar-item gradient-sidebar-title">${t(
      "Description"
    )}</div>
    <div style="display:none" class="collapsable">
      <input
        class="description w3-input"
        style="background: none"
        type="text"
        placeholder="${t("No description")}"
      />
    </div>
    <div class="collapsible gradient-sidebar-title">${t(
      "Effects"
    )}<div class="effects-title"></div></div>
    <div class="collapsable">
      <div class="effects"></div>
      <div class="history"></div>
    </div>
    <div class="collapsible collapsed gradient-sidebar-title">${t(
      "Album"
    )}</div>
    <div class="collapsable collapsable-collapsed album-contents"></div>
    <div class="collapsible collapsed gradient-sidebar-title">${t(
      "Metadata"
    )}</div>
    <div class="collapsable collapsable-collapsed metadata"></div>
    <div class="collapsible collapsed gradient-sidebar-title">${t(
      "Identify"
    )}</div>
    <div class="collapsable collapsable-collapsed identify"></div>
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
    <div class="star big-star"></div>
  </div>
</div>`;

const toolsHTML = `
<div class="editor-bottom-tools">
  <div class="image-strip">
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
) {
  const editor = $(editHTML);
  const selectionManager = new SelectionManager<AlbumEntry>(
    [initialList[initialIndex]],
    idFromAlbumEntry
  );

  const image = $(".edited-image", editor);
  const video = $(".edited-video", editor);
  const imageContainer = $(".image-container", editor);
  const tool = $(toolsHTML);

  const collapsibleItems = editor.all(".collapsible");
  for (const collapsible of collapsibleItems) {
    collapsible.on("click", () => {
      const collapse = !collapsible.hasClass("collapsed");

      collapsible.addRemoveClass("collapsed", collapse);
      const content = collapsible.get().nextElementSibling! as HTMLElement;
      $(content).addRemoveClass("collapsable-collapsed", collapse);
    });
  }

  const metadata = $(".metadata", editor);
  const identify = $(".identify", editor);
  const album = $(".album-contents", editor);
  album.append(tool);

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
      setupBrightness(imageController, toolRegistrar);
      setupFill(imageController, toolRegistrar);
      setupSepia(imageController, toolRegistrar);
      setupPolaroid(imageController, toolRegistrar);
      setupRotate(imageController, toolRegistrar);
      setupFlip(imageController, toolRegistrar);
      setupMirror(imageController, toolRegistrar);
      setupBlur(imageController, toolRegistrar);
      setupSharpen(imageController, toolRegistrar);
      setupFilters(imageController, toolRegistrar);

      toolRegistrar.selectPage(GENERAL_TOOL_TAB);
      const refreshMetadataFct = makeMetadata(metadata);
      makeIdentify(identify, imageController);

      const entries = await buildAlbumEntryEx(initialList);
      const s = await getService();

      const activeManager = new ActiveImageManager(
        entries,
        entries[initialIndex]
      );
      refreshMetadataFct(entries[initialIndex], [entries[initialIndex]]);
      const offStrip = await makeImageStrip(
        $(".image-strip", tool),
        activeManager
      );
      const updateStarCount = (entry: AlbumEntryPicasa) => {
        $(".star", imageContainer).css({
          display: entry.metadata.star ? "" : "none",
          width: `${parseInt(entry.metadata.starCount || "1") * 40}px`,
        });
      };
      const offImgCtrl = await imageController.init(activeManager.active());

      const off = [
        offStrip,
        offImgCtrl,
        imageController.events.on("idle", () => {
          $(".busy-spinner", editor).css("display", "none");
        }),
        imageController.events.on("busy", () => {
          $(".busy-spinner", editor).css("display", "block");
        }),
        activeManager.event.on("changed", (entry) => {
          imageController.display(entry);
          tabEvent.emit("rename", { name: entry.name });
          updateStarCount(entry);
          refreshMetadataFct(entry, [entry]);
          selectionManager.clear();
          selectionManager.select(entry);
        }),
        appEvents.on("keyDown", async ({ code, win, ctrl, key }) => {
          if (win.get() === editor.get()) {
            switch (code) {
              case "Space":
                await toggleStar([activeManager.active()]);
                break;
              case "ArrowLeft":
                activeManager.selectPrevious();
                appEvents.emit("editSelect", { entry: activeManager.active() });
                break;
              case "ArrowRight":
                activeManager.selectNext();
                appEvents.emit("editSelect", { entry: activeManager.active() });
                break;
              case "Escape":
                deleteTabWin(win);
            }
            if (ctrl) {
              const s = await getService();
              const shortcuts = await s.getShortcuts();
              if (shortcuts[key]) {
                const target = shortcuts[key];
                s.createJob(JOBNAMES.EXPORT, {
                  source: selectionManager.selected(),
                  destination: target,
                });
                return;
              }
            }
          }
        }),
        appEvents.on("tabDeleted", ({ win }) => {
          if (win.get() === editor.get()) {
            off.forEach((o) => o());
          }
        }),

        s.on(
          "albumEntryAspectChanged",
          async (e: { payload: AlbumEntryPicasa }) => {
            if (
              e.payload.album.key === activeManager.active().album.key &&
              e.payload.name === activeManager.active().name
            ) {
              updateStarCount(e.payload);
            }
          }
        ),
      ];
      const z = $(".zoom-ctrl", tool);
      z.on("input", () => {
        zoomController.zoom(z.val() / 10);
      });
      zoomController.events.on("zoom", (zoom) => {
        z.val(zoom.scale * 10);
      });
    }
  });
  return { win: editor, tab, selectionManager };
}
