import { Emitter } from "../lib/event.js";
import { AlbumListEvent } from "../types/types.js";
import { questionIsDisplayed } from "./question.js";
import { activeTab } from "./tabs.js";

export function makeHotkeys(emitter: Emitter<AlbumListEvent>) {
  document.addEventListener("keydown", (ev: KeyboardEvent) => {
    if (questionIsDisplayed()) {
      return;
    }

    if (document.activeElement && document.activeElement.tagName === "INPUT") {
      return;
    }
    const _activeTab = activeTab();
    ev.preventDefault();
    emitter.emit("keyDown", {
      code: ev.code,
      win: _activeTab.win.get(),
    });
  });
}
