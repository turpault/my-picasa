import { $ } from "../lib/dom";
import { buildEmitter } from "../../shared/lib/event";
import { AppEventSource } from "../uiTypes";
import { activeTab } from "./tabs";

export type KeyboardHook = {
  keyDown: {
    code: string;
    key: string;
    meta: boolean;
    ctrl: boolean;
    shift: boolean;
    alt: boolean;
    preventDefault: () => void;
  };
};

export const hookKeyboardEvents = buildEmitter<KeyboardHook>();

export function makeHotkeys(emitter: AppEventSource) {
  document.addEventListener("keyup", (ev: KeyboardEvent) => {
    console.warn("keyup", ev.code);
    if (hookKeyboardEvents.has("keyDown")) {
      hookKeyboardEvents.emit("keyDown", {
        code: ev.code,
        key: ev.key,
        meta: ev.metaKey,
        ctrl: ev.ctrlKey,
        shift: ev.shiftKey,
        alt: ev.altKey,
        preventDefault: () => {
          ev.preventDefault();
        },
      });
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
      preventDefault: () => {
        ev.preventDefault();
      },
    });
  });
}
