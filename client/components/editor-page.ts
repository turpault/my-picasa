import { setupAutocolor } from "../features/autocolor";
import { setupContrast } from "../features/contrast";
import { setupBlur } from "../features/blur";
import { setupBrightness } from "../features/brightness";
import { setupCrop } from "../features/crop";
import { setupFlip } from "../features/flip";
import { setupGamma } from "../features/gamma";
import { setupMirror } from "../features/mirror";
import { setupPolaroid } from "../features/polaroid";
import { setupRotate } from "../features/rotate";
import { setupSepia } from "../features/sepia";
import { setupSharpen } from "../features/sharpen";
import { getAlbumInfo } from "../folder-utils";
import { $ } from "../lib/dom";
import { toggleStar } from "../lib/handles";
import { ImagePanZoomController } from "../lib/panzoom";
import { ActiveImageManager } from "../selection/active-manager";
import { Album, AlbumInfo, AlbumListEventSource } from "../types/types";
import { animateStar } from "./animations";
import { ImageController } from "./image-controller";
import { makeImageStrip } from "./image-strip";
import { deleteTabWin } from "./tabs";
import { make as makeTools } from "./tools";

const editHTML = `<div class="fill">
<div class="fill w3-bar-block tools">
  <div class="w3-bar-item w3-white">Description</div>
  <div>
    <input
      class="description w3-input"
      style="background: none"
      type="text"
    />
  </div>
  <div class="w3-bar-item w3-white">Actions</div>
  <div class="actions"></div>
  <div class="w3-bar-item w3-white">History</div>
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
<div class="editor-bottom-tools">
<div class="zoom-strip">  
  <label>Zoom</label>
  <input type="range" min="100" max="1000" value="100" class="zoom-ctrl slider">
</div>
<div class="image-strip">
    <button
      class="previous-image w3-circle fa fa-arrow-left w3-green"
      style="position: absolute; left: 0; top: 0"
    ></button>
    <button
      class="next-image w3-circle fa fa-arrow-right w3-green"
      style="position: absolute; right: 0; top: 0"
    ></button>
    <div class="image-strip-thumbs"></div>
  </div>
</div>
</div>`;

export async function makeEditorPage(
  album: Album,
  name: string,
  events: AlbumListEventSource
): Promise<HTMLElement> {
  const e = $(editHTML);

  const image = $(".edited-image", e).get()!;
  const video = $(".edited-video", e).get()!;
  const imageContainer = $(".image-container", e);

  const zoomController = new ImagePanZoomController(image as HTMLImageElement);
  const imageController = new ImageController(
    image as HTMLImageElement,
    video as HTMLVideoElement,
    zoomController
  );
  const toolRegistrar = makeTools($(".tools", e).get()!, imageController);
  // Add all the activable features
  setupCrop(
    imageContainer.get()!,
    zoomController,
    imageController,
    toolRegistrar
  );
  setupAutocolor(imageController, toolRegistrar);
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

  const f: AlbumInfo = await getAlbumInfo(album, true);
  const activeManager = new ActiveImageManager(f.assets, { album, name });
  makeImageStrip($(".image-strip", e).get()!, album, f, activeManager);

  imageController.init({ album, name });

  activeManager.event.on("changed", (event: { name: string }) => {
    imageController.display(event.name);
  });
  imageController.events.on("idle", () => {
    $(".busy-spinner", e).css("display", "none");
  });
  imageController.events.on("busy", () => {
    $(".busy-spinner", e).css("display", "block");
  });
  events.on("keyDown", async ({ code, win }) => {
    switch (code) {
      case "Space":
        const target = await toggleStar([{ album, name }]);
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
  });
  const z = $(".zoom-ctrl", e);
  z.on("input", () => {
    zoomController.zoom(z.val() / 100);
  });
  zoomController.events.on("zoom", (zoom) => {
    z.val(zoom.scale * 100);
  });

  events.on("tabDeleted", ({ win }) => {
    if (win.get() === e.get()) {
    }
  });

  return e.get();
}
