import { Emitter } from "../lib/event";
import { AlbumListEvent } from "../types/types";
import { questionIsDisplayed } from "./question";
import { activeTab } from "./tabs";

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
