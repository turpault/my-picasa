import { $ } from "../lib/dom";
import {
  getSettings,
  getSettingsEmitter,
  updateFilterByFavoritePhoto,
  updateFilterByLocation,
  updateFilterByPeople,
  updateFilterByPersons,
  updateFilterByStar,
  updateFilterByText,
  updateFilterByVideos,
} from "../lib/settings";
import { getService } from "../rpc/connect";
import { AlbumEntrySelectionManager } from "../selection/selection-manager";
import { Contact } from "../types/types";
import { MultiSelect } from "./controls/multi-dropdown";
import { PicasaMultiButton } from "./controls/multibutton";
import { makeNewAlbum } from "./global-actions";
import { t } from "./strings";

const html = `<div class="browser-header">
<picasa-button class="new-album" icon="resources/images/folder-plus.svg">${t(
  "New album",
)}</picasa-button>
<span  style="display: inline-block; width: 1px;" class="vertical-separator"></span>
<div id="filters" class="filters">
<span class="filters-title">${t("Filters")}</span>
<picasa-multi-button class="filter-button filter-by-favorite" items="☆|🌟|🌟🌟|🌟🌟🌟" selected="0" ></picasa-multi-button>
<picasa-multi-button class="filter-button filter-by-type" items="🎞|👤|📍|" selected="" multiselect></picasa-multi-button>
<span  style="display: inline-block; width: 1px;" class="vertical-separator"></span>
<div class="filter-by-person-container">
 <select class="filter-by-person-container-list"></select>
</div>
<span  style="display: inline-block; width: 1px;" class="vertical-separator"></span>
<input class="filter-by-text" placeholder="🔍" type="text">
</div>
`;

export async function makeBrowserHeader(
  selectionManager: AlbumEntrySelectionManager,
) {
  const container = $(html);
  const filterFavorites = $(".filter-by-favorite", container);
  const filterType = $(".filter-by-type", container);
  const filterText = $(".filter-by-text", container);
  const filters = filterType.get() as PicasaMultiButton;

  filterFavorites.on("select", (_e) => {
    const val = parseInt(filterFavorites.attr("selected"));
    updateFilterByStar(val);
  });
  filterType.on("select", () => {
    const activeFilters = filters.selected();
    updateFilterByVideos(activeFilters.includes(0));
    updateFilterByPeople(activeFilters.includes(1));
    updateFilterByLocation(activeFilters.includes(2));
    updateFilterByFavoritePhoto(activeFilters.includes(3));
  });
  filterText.on("input", () => {
    updateFilterByText(filterText.val());
  });

  getSettingsEmitter().on("changed", () => {
    const settings = getSettings();
    filters.select(0, settings.filters.video);
    filters.select(1, settings.filters.people);
    filters.select(2, settings.filters.location);
    filters.select(3, settings.filters.isFavoriteInIPhoto);
    filterFavorites.attr("selected", settings.filters.star);
  });
  $(".new-album", container).on("click", makeNewAlbum);

  getService().then(async (s) => {
    const contacts: Contact[] = await s.getContacts();

    const personContainer = $(".filter-by-person-container-list", container);
    personContainer.empty();
    const settings = getSettings();
    const initialList = settings.filters.persons;
    new MultiSelect(personContainer.get(), {
      data: contacts
        .filter((c) => c.name && c.name !== "_UNKNOWN_")
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((c) => ({
          value: c.name,
          text: c.name,
          selected: initialList.includes(c.name),
          html: null as null | string,
        })),
      placeholder: t("Filter by person"),
      search: true,
      selectAll: true,
      listAll: false,
      max: 5,
      onChange: function (values, text, element) {
        updateFilterByPersons(values);
      },
      onSelect: function (value, text, element) {
        //console.log("Selected:", value, text, element);
      },
      onUnselect: function (value, text, element) {
        //console.log("Unselected:", value, text, element);
      },
    });
  });
  return container;
}
