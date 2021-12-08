import { $ } from "../lib/dom";
import { AlbumListEventSource } from "../types/types";
import { animateStar } from "./animations";

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
