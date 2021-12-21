import { $ } from "../lib/dom";
import {
  getSettings,
  getSettingsEmitter,
  updateIconSize,
} from "../lib/settings";

export async function makePhotoZoomController(e: HTMLElement) {
  const elem = $(e);
  elem.on("input", () => {
    updateIconSize(elem.val());
  });
  getSettingsEmitter().on("changed", (event) => {
    if (event.field === "iconSize") elem.val(event.iconSize);
  });
  elem.val(getSettings().iconSize);
}
