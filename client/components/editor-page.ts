import { setupAutocolor } from "../features/autocolor.js";
import { setupBrightness } from "../features/brightness.js";
import { setupCrop } from "../features/crop.js";
import { setupFlip } from "../features/flip.js";
import { setupMirror } from "../features/mirror.js";
import { setupPolaroid } from "../features/polaroid.js";
import { setupRotate } from "../features/rotate.js";
import { setupSepia } from "../features/sepia.js";
import { getAlbumInfo } from "../folder-utils.js";
import { $ } from "../lib/dom.js";
import { ImagePanZoomController } from "../lib/panzoom.js";
import { ActiveImageManager } from "../selection/active-manager.js";
import { Album, AlbumInfo } from "../types/types.js";
import { ImageController } from "./image-controller.js";
import { makeImageStrip } from "./image-strip.js";
import { make as makeTools } from "./tools.js";

const editHTML = `<div class="fill">
<div class="fill w3-bar-block tools">
  <div class="w3-bar-item w3-white">Description</div>
  <div>
    <label>Label</label>
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
  <div class="crop">
    <span class="crop-buttons w3-bar w3-blue">
      <button
        class="btn-orientation w3-button w3-bar-item override-pointer-active"
      >
        <i class="fa fa-redo"></i>
      </button>
      <button
        class="btn-5x5 w3-button override-pointer-active w3-bar-item"
      >
        5x5
      </button>
      <button
        class="btn-6x4 w3-button override-pointer-active w3-bar-item"
      >
        6x4
      </button>
      <button
        class="btn-4x3 w3-button override-pointer-active w3-bar-item"
      >
        4x3
      </button>
      <button
        class="btn-16x9 w3-button override-pointer-active w3-bar-item"
      >
        16x9
      </button>
      <button
        class="btn-ok-crop w3-button w3-bar-item override-pointer-active"
      >
        <i class="fa fa-check-circle"></i>
      </button>
      <button
        class="btn-cancel-crop w3-button w3-bar-item override-pointer-active"
      >
        <i class="fa fa-times"></i>
      </button>
    </span>
  </div>
  <div    
    style="display: none"
    class="busy-spinner w3-display-container fill"
  >
    <img src="resources/images/thinking.gif" class="w3-display-middle" />
  </div>
  <img class="fill-with-aspect edited-image"></img>
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
  name: string
): Promise<HTMLElement> {
  const e = $(editHTML);

  const image = $(".edited-image", e).get()!;

  const zoomController = new ImagePanZoomController(image as HTMLImageElement);
  const imageController = new ImageController(
    image as HTMLImageElement,
    zoomController
  );
  const toolRegistrar = makeTools($(".tools", e).get()!, imageController);
  // Add all the activable features
  setupCrop(e.get(), zoomController, imageController, toolRegistrar);
  setupBrightness(imageController, toolRegistrar);
  setupSepia(imageController, toolRegistrar);
  setupAutocolor(imageController, toolRegistrar);
  setupPolaroid(imageController, toolRegistrar);
  setupRotate(imageController, toolRegistrar);
  setupFlip(imageController, toolRegistrar);
  setupMirror(imageController, toolRegistrar);

  const f: AlbumInfo = await getAlbumInfo(album);
  const activeManager = new ActiveImageManager(f.pictures, { album, name });
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
  return e.get();
}
