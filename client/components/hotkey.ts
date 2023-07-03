import { $ } from "../lib/dom";
import { AppEventSource } from "../uiTypes";
import { questionIsDisplayed } from "./question";
import { activeTab } from "./tabs";

export function makeHotkeys(emitter: AppEventSource) {
  document.addEventListener("keyup", (ev: KeyboardEvent) => {
    console.warn("keyup", ev.code);
    if (questionIsDisplayed()) {
      return;
    }

    if (
      document.activeElement &&
      (document.activeElement.tagName === "INPUT" ||
        $(document.activeElement).attr("contenteditable") === "true")
    ) {
      return;
    }
    const _activeTab = activeTab();
    emitter.emit("keyDown", {
      code: ev.code,
      key: ev.key,
      meta: ev.metaKey,
      ctrl: ev.ctrlKey,
      shift: ev.shiftKey,
      alt: ev.altKey,
      win: _activeTab.win,
      preventDefault: () => ev.preventDefault(),
    });
  });
}
