import { buildEmitter } from "../../shared/lib/event";
import {} from "../../shared/types/types";
import { $, _$ } from "../lib/dom";
import { getService } from "../rpc/connect";
import { AlbumListEvent, AppEventSource } from "../uiTypes";
import { makeAlbumList } from "./browser-album-list";
import { makePhotoList } from "./browser-photo-list";
import { makeButtons } from "./browser-photo-list-buttons";
import { question } from "./question";

const html = `<div class="browser fill" style="position: relative">
</div>`;

const tabHtml = `<div class="tab-button browser-tab">
<input type="text" class="w3-button filterAlbum" placeholder="Browser">
<button data-tooltip-below="New Album" class="w3-button new-album-button" style="background-image: url(resources/images/icons/actions/new-album-50.png)"></button>
</div>`;

export async function makeBrowser(
  emitter: AppEventSource
): Promise<{ win: _$; tab: _$, tool: _$ }> {
  const win = $(html);

  const albumEmitter = buildEmitter<AlbumListEvent>();

  win.append(await makeAlbumList(emitter, albumEmitter));
  win.append(await makePhotoList(emitter, albumEmitter));
  const tool = await makeButtons(emitter, albumEmitter);

  const tab = $(tabHtml);
  // Status change events
  const filter = $(".filterAlbum", tab).on("input", () => {
    albumEmitter.emit("filterChanged", { filter: filter.val() });
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

  albumEmitter.emit("ready", {});
  return { win, tab, tool };
}
