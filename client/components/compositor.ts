import { buildEmitter } from "../../shared/lib/event";
import { $, _$ } from "../lib/dom";
import { AppEventSource } from "../uiTypes";
import { animateStar } from "./animations";
import { makeGenericTab, TabEvent } from "./tabs";

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
  appEvents: AppEventSource
): Promise<{ win: _$; tab: _$ }> {
  const e = $(editHTML);

  const off = [
    appEvents.on("keyDown", ({ code }) => {
      switch (code) {
        case "Space":
          animateStar(true);
        default:
      }
    }),

    appEvents.on("tabDeleted", ({ win }) => {
      if (win.get() === e.get()) {
        off.forEach((o) => o());
      }
    }),
  ];

  const tabEvent = buildEmitter<TabEvent>();
  tabEvent.emit("rename", { name: "Compositor" });
  return { win: e, tab: makeGenericTab(tabEvent) };
}
