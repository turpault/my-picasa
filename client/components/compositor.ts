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
<div class="fill w3-bar-block composition-parameters">
  <div class="w3-bar-item w3-white">Parameters</div>
    <div class="parameters">
    <div class="w3-dropdown-hover">
      <button class="w3-button">Layout</button>
      <div class="w3-dropdown-content w3-bar-block w3-card-4">
        <a href="#" class="w3-bar-item w3-button">6x4</a>
        <a href="#" class="w3-bar-item w3-button">5x5</a>
        <a href="#" class="w3-bar-item w3-button">4x6</a>
      </div>
    </div>
    <div class="w3-dropdown-hover">
      <button class="w3-button">Presentation</button>
      <div class="w3-dropdown-content w3-bar-block w3-card-4">
        <a href="#" class="w3-bar-item w3-button">Center Image</a>
        <a href="#" class="w3-bar-item w3-button">Spiral</a>
        <a href="#" class="w3-bar-item w3-button">Random</a>
        <a href="#" class="w3-bar-item w3-button">Pile</a>
      </div>
    </div>
  </div>
  <div class="w3-bar-item w3-white">Selection</div>
</div>

<div class="composition-container">
</div>
</div>`;

export async function makeCompositorPage(
  events: AlbumListEventSource
): Promise<HTMLElement> {
  const e = $(editHTML);

  events.on("keyDown", ({ code, win }) => {
    switch (code) {
      case "Space":
        animateStar(true);
      default:
    }
  });

  events.on("tabDeleted", ({ win }) => {
    if (win.get() === e.get()) {
    }
  });

  return e.get();
}
