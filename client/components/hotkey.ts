import { Emitter } from "../lib/event.js";
import { AlbumListEvent } from "../types/types.js";
import { questionIsDisplayed } from "./question.js";
import { activeTab } from "./tabs.js";

export function makeHotkeys(emitter: Emitter<AlbumListEvent>) {
  document.addEventListener("keydown", (ev: KeyboardEvent) => {
    if (questionIsDisplayed()) {
      return;
    }
    const _activeTab = activeTab();
    ev.preventDefault();
    emitter.emit("keyDown", {
      code: ev.code,
      tab: _activeTab.win.get(),
    });
  });
}
