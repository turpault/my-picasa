import { buildEmitter } from "../../shared/lib/event";
import {} from "../../shared/types/types";
import { AlbumDataSource } from "../album-data-source";
import { $, _$ } from "../lib/dom";
import { AlbumListEvent, AppEventSource } from "../uiTypes";
import { makeAlbumList } from "./browser-album-list";
import { makePhotoList } from "./browser-photo-list";
import { makeButtons } from "./browser-photo-list-buttons";
import { makePhotoZoomController } from "./image-zoom-controller";

const html = `<div class="browser fill" style="position: relative">
</div>`;

const tabHtml = `<input type="text" class="filterAlbum browser-tab w3-button tab-button" placeholder="Browser">`;

export async function makeBrowser(
  emitter: AppEventSource
): Promise<{ win: _$; tab: _$ }> {
  const win = $(html);

  const albumEmitter = buildEmitter<AlbumListEvent>();
  const dataSource = new AlbumDataSource();

  win.append(await makeAlbumList(dataSource, emitter, albumEmitter));
  win.append(await makePhotoList(dataSource, emitter, albumEmitter));
  win.append(await makeButtons(emitter, albumEmitter));

  const tab = $(tabHtml);
  // Status change events
  const filter = tab.on("input", () => {
    albumEmitter.emit("filterChanged", { filter: filter.val() });
  });

  albumEmitter.emit("ready", {});
  return { win, tab };
}
