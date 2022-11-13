import { buildEmitter } from "../../shared/lib/event";
import { JOBNAMES } from "../../shared/types/types";
import { AlbumIndexedDataSource } from "../album-data-source";
import { $, _$ } from "../lib/dom";
import { getService } from "../rpc/connect";
import { SelectionManager } from "../selection/selection-manager";
import { AlbumListEvent, AppEventSource } from "../uiTypes";
import { makeAlbumList } from "./browser-album-list";
import { makePhotoList } from "./browser-photo-list";
import { makeButtons } from "./browser-photo-list-buttons";
import { message, Button } from "./message";
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
) {
  const win = $(html);
  const selectionManager = new SelectionManager();

  win.append(await makeAlbumList(emitter, albumDataSource, selectionManager));
  win.append(await makePhotoList(emitter, albumDataSource, selectionManager));

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

  emitter.on("keyDown", async (e) => {
    if (e.win === win) {
      if (e.ctrl) {
        const s = await getService();
        if (albumDataSource.shortcuts[e.key]) {
          const target = albumDataSource.shortcuts[e.key];
          s.createJob(JOBNAMES.EXPORT, {
            source: selectionManager.selected(),
            destination: target,
          });
          return;
        }
      }
      if (
        (e.code === "Backspace" || e.code === "Delete") &&
        selectionManager.selected().length > 0
      ) {
        if (
          (await message(
            t(
              `Do you want to delete $1 files|${
                selectionManager.selected().length
              }`
            ),
            [Button.Ok, Button.Cancel]
          )) === Button.Ok
        ) {
          const s = await getService();
          s.createJob(JOBNAMES.DELETE, {
            source: selectionManager.selected(),
          });
        }
      }
      return;
    }
  });

  return { win, tab, selectionManager };
}
