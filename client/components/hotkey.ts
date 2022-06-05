import { $ } from "../lib/dom";
import { AppEventSource } from "../uiTypes";
import { questionIsDisplayed } from "./question";
import { activeTab } from "./tabs";

export function makeHotkeys(emitter: AppEventSource) {
  document.addEventListener("keydown", (ev: KeyboardEvent) => {
    if (questionIsDisplayed()) {
      return;
    }

    if (document.activeElement && 
      (document.activeElement.tagName === "INPUT" ||
      $(document.activeElement).attr("contenteditable") === "true"
      )) {
      return;
    }
    const _activeTab = activeTab();
    ev.preventDefault();
    emitter.emit("keyDown", {
      code: ev.code,
      win: _activeTab.win,
    });
  });
}
