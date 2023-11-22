import { $ } from "../lib/dom";
import { AlbumEntrySelectionManager } from "../selection/selection-manager";
import { makeImageStrip } from "./image-strip";
import { t } from "./strings";

const html = `<div class="browser-header">
<picasa-button icon="resources/images/Dark_blue_left_arrow.svg">${t(
  "Back to Photo Library"
)}</picasa-button>
<span  style="display: inline-block; width: 1px;" class="vertical-separator"></span>
<picasa-button>${t("▶ Play")}</picasa-button>
<picasa-multi-button class="a-b" items="A|A/B|A/A" selected="0" ></picasa-multi-button>
`;

export function makeEditorHeader(selectionManager: AlbumEntrySelectionManager) {
  const container = $(html);
  container.append(
    $(makeImageStrip(selectionManager)).addClass("strip-container")
  );
  return container;
}
