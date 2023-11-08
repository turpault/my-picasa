import { AlbumIndexedDataSource } from "../album-data-source";
import { $ } from "../lib/dom";
import {
  getSettings,
  getSettingsEmitter,
  updateFilterByStar,
  updateFilterByText,
  updateFilterByVideos,
} from "../lib/settings";
import { AlbumEntrySelectionManager } from "../selection/selection-manager";
import { AppEventSource } from "../uiTypes";
import { t } from "./strings";

const html = `<div class="browser-header">
<picasa-button>${t("🆕 New album")}</picasa-button>
<span  style="display: inline-block; width: 1px;" class="vertical-separator"></span>
<picasa-multi-button class="filter-by-favorite" items="☆|🌟|🌟🌟|🌟🌟🌟" selected="0" ></picasa-multi-button>
<label></label><picasa-multi-button class="filter-by-type" items="📷🎥|📷|🎥" selected="0" ></picasa-multi-button>
<span  style="display: inline-block; width: 1px;" class="vertical-separator"></span>
<input class="filter-by-text" placeholder="${t("Search...")}" type="text">

<!--<picasa-button>Test Button</picasa-button>
<picasa-button icon="resources/images/icons/actions/export-50.png">Test Button With Image</picasa-button>
<picasa-button icon="resources/images/icons/actions/trash-50.png"></picasa-button>
<picasa-multi-button items="Button1|Button2|url:resources/images/icons/actions/export-50.png" selected="1" ></picasa-multi-button>
<picasa-multi-button items="Button1|Button2|url:resources/images/icons/actions/export-50.png" selected="0" ></picasa-multi-button>
<select is="picasa-select" selected="0" >
<option>Button1</option>
<option>Button2</option>
<option>Button3</option>
<select>
<input is="picasa-slider" min="0" max="100" value="50" ticks="33,66">
</div>
-->
`;

export async function makeBrowserHeader(
  appEvents: AppEventSource,
  albumDataSource: AlbumIndexedDataSource,
  selectionManager: AlbumEntrySelectionManager
) {
  const container = $(html);
  const filterFavorites = $(".filter-by-favorite", container);
  const filterType = $(".filter-by-type", container);
  const filterText = $(".filter-by-text", container);

  filterFavorites.on("select", (_e) => {
    const val = parseInt(filterFavorites.attr("selected"));
    updateFilterByStar(val);
  });
  filterType.on("select", () => {
    const val = parseInt(filterType.attr("selected"));
    updateFilterByVideos(val);
  });
  filterText.on("input", () => {
    updateFilterByText(filterText.val());
  });

  getSettingsEmitter().on("changed", () => {
    const settings = getSettings();
    filterType.attr("selected", settings.filters.video);
    filterFavorites.attr("selected", settings.filters.star);
  });
  return container;
}
