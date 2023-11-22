import { AlbumIndexedDataSource } from "../album-data-source";
import { $ } from "../lib/dom";
import { AlbumEntrySelectionManager } from "../selection/selection-manager";
import { AppEventSource } from "../uiTypes";
import { makeAlbumList } from "./browser-album-list";
import { makeBrowserHeader } from "./browser-header";
import { makePhotoList } from "./browser-photo-list";

export async function makeBrowserNavigator(
  appEvents: AppEventSource,
  albumDataSource: AlbumIndexedDataSource,
  selectionManager: AlbumEntrySelectionManager
) {
  const e = $(`<div class="browser-navigator fill"></div>`);
  e.append(await makeBrowserHeader(selectionManager));
  e.append(await makeAlbumList(appEvents, albumDataSource, selectionManager));
  e.append(await makePhotoList(appEvents, albumDataSource, selectionManager));

  appEvents.on("edit", (event) => {
    if (event.active) {
      e.hide();
    } else {
      e.show();
    }
  });

  return e;
}
