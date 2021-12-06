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
