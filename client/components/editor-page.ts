import { setupAutocolor } from "../features/autocolor.js";
import { setupContrast } from "../features/contrast.js";
import { setupBlur } from "../features/blur.js";
import { setupBrightness } from "../features/brightness.js";
import { setupCrop } from "../features/crop.js";
import { setupFlip } from "../features/flip.js";
import { setupGamma } from "../features/gamma.js";
import { setupMirror } from "../features/mirror.js";
import { setupPolaroid } from "../features/polaroid.js";
import { setupRotate } from "../features/rotate.js";
import { setupSepia } from "../features/sepia.js";
import { setupSharpen } from "../features/sharpen.js";
import { getAlbumInfo } from "../folder-utils.js";
import { $ } from "../lib/dom.js";
import { toggleStar } from "../lib/handles.js";
import { ImagePanZoomController } from "../lib/panzoom.js";
import { ActiveImageManager } from "../selection/active-manager.js";
import { Album, AlbumInfo, AlbumListEventSource } from "../types/types.js";
import { animateStar } from "./animations.js";
import { ImageController } from "./image-controller.js";
import { makeImageStrip } from "./image-strip.js";
import { deleteTabWin } from "./tabs.js";
import { make as makeTools } from "./tools.js";

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

  const zoomController = new ImagePanZoomController(image as HTMLImageElement);
  const imageController = new ImageController(
    image as HTMLImageElement,
    video as HTMLVideoElement,
    zoomController
  );
  const toolRegistrar = makeTools($(".tools", e).get()!, imageController);
  // Add all the activable features
  setupCrop(e.get(), zoomController, imageController, toolRegistrar);
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
