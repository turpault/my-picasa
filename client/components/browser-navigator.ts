import { AlbumIndexedDataSource } from "../album-data-source";
import { $ } from "../lib/dom";
import { State } from "../lib/state";
import { AlbumEntrySelectionManager } from "../selection/selection-manager";
import { AppEventSource, ApplicationState } from "../uiTypes";
import { makeAlbumList } from "./browser-album-list";
import { makeBrowserHeader } from "./browser-header";
import { makePhotoList } from "./browser-photo-list";

export async function makeBrowserNavigator(
  appEvents: AppEventSource,
  albumDataSource: AlbumIndexedDataSource,
  selectionManager: AlbumEntrySelectionManager,
  state: ApplicationState
) {
  const e = $(`<div class="browser-navigator fill"></div>`);
  const header = await makeBrowserHeader(selectionManager);
  const albumList = await makeAlbumList(
    appEvents,
    albumDataSource,
    selectionManager
  );
  const photoList = await makePhotoList(
    appEvents,
    albumDataSource,
    selectionManager
  );

  e.append(header);
  e.append(albumList);
  e.append(photoList);
  function updatePhotoListSize() {
    const metaVisible = state.getValue("activeMetaPage") !== undefined;
    photoList.css({
      right: metaVisible ? "300px" : 0,
    });
  }
  state.events.on("activeMetaPage", updatePhotoListSize);
  updatePhotoListSize();

  return e;
}
