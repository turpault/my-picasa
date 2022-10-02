import { buildEmitter } from "../../shared/lib/event";
import {} from "../../shared/types/types";
import { AlbumIndexedDataSource } from "../album-data-source";
import { $, _$ } from "../lib/dom";
import { getService } from "../rpc/connect";
import { AlbumListEvent, AppEventSource } from "../uiTypes";
import { makeAlbumList } from "./browser-album-list";
import { makePhotoList } from "./browser-photo-list";
import { makeButtons } from "./browser-photo-list-buttons";
import { question } from "./question";
import { t } from "./strings";

const html = `<div class="browser fill" style="position: relative">
</div>`;

const tabHtml = `<div class="tab-button browser-tab">
<input type="text" class="w3-button filterAlbum" placeholder=${t("Browser")}>
<button data-tooltip-below="New Album" class="w3-button new-album-button" style="background-image: url(resources/images/icons/actions/new-album-50.png)"></button>
</div>`;

export async function makeBrowser(
  emitter: AppEventSource,
  albumDataSource: AlbumIndexedDataSource

): Promise<{ win: _$; tab: _$, tool: _$ }> {
  const win = $(html);

  win.append(await makeAlbumList(emitter, albumDataSource));
  win.append(await makePhotoList(emitter, albumDataSource));
  const tool = await makeButtons(emitter, albumDataSource.emitter);

  const tab = $(tabHtml);
  // Status change events
  const filter = $(".filterAlbum", tab).on("input", () => {
    albumDataSource.emitter.emit("filterChanged", { filter: filter.val() });
  });
  $(".new-album-button", tab).on("click", async () => {
    const newAlbum = await question(
      "New album name",
      "Please type the new album name"
    );
    if (newAlbum) {
      const s = await getService();
      s.makeAlbum(newAlbum);
    }
  });

  return { win, tab, tool };
}
