import { $ } from "../lib/dom";
import { AlbumEntrySelectionManager } from "../selection/selection-manager";
import { AppEventSource } from "../uiTypes";
import { makeImageStrip } from "./image-strip";
import { notImplemented } from "./message";
import { t } from "./strings";

const html = `<div class="browser-header">
<picasa-button class="back-to-photo-lib" icon="resources/images/Dark_blue_left_arrow.svg">${t(
  "Back to Photo Library"
)}</picasa-button>
<span  style="display: inline-block; width: 1px;" class="vertical-separator"></span>
<picasa-button class="play-slideshow">${t("▶ Play")}</picasa-button>
<picasa-multi-button class="a-b" items="A|A/B|A/A" selected="0" ></picasa-multi-button>
`;

export function makeEditorHeader(
  appEvents: AppEventSource,
  selectionManager: AlbumEntrySelectionManager
) {
  const container = $(html);
  $(".play-slideshow", container).on("click", notImplemented);
  $(".back-to-photo-lib", container).on("click", () => {
    appEvents.emit("edit", {
      active: false,
    });
    return true;
  });
  $(".a-b", container).on("select", notImplemented);
  container.append(
    $(makeImageStrip(selectionManager)).addClass("strip-container")
  );
  return container;
}
