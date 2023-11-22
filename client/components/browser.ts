import { idFromAlbumEntry } from "../../shared/lib/utils";
import { AlbumEntry, JOBNAMES } from "../../shared/types/types";
import { AlbumIndexedDataSource } from "../album-data-source";
import { $ } from "../lib/dom";
import { getService } from "../rpc/connect";
import { SelectionManager } from "../selection/selection-manager";
import { AppEventSource } from "../uiTypes";
import { makeAlbumList } from "./browser-album-list";
import { makeBrowserHeader } from "./browser-header";
import { makeBrowserNavigator } from "./browser-navigator";
import { makePhotoList } from "./browser-photo-list";
import { makeButtons } from "./browser-photo-list-buttons";
import { makeEditorPage } from "./editor-page";
import { Button, message } from "./message";
import { t } from "./strings";

const html = `<div class="browser fill" >
</div>`;

//<button data-tooltip-below="New Album" class="w3-button new-album-button" style="background-image: url(resources/images/icons/actions/new-album-50.png)"></button>
const tabHtml = `<div class="tab-button browser-tab">
<span class="browser-tab-text">${t("Browser")}</span>
</div>`;

export async function makeBrowser(
  emitter: AppEventSource,
  albumDataSource: AlbumIndexedDataSource
) {
  const win = $(html);
  const selectionManager = new SelectionManager<AlbumEntry>(
    [],
    idFromAlbumEntry
  );

  selectionManager.events.on("added", () => {
    emitter.emit("browserSelectionChanged", {
      selection: selectionManager.selected(),
    });
  });
  selectionManager.events.on("removed", () => {
    emitter.emit("browserSelectionChanged", {
      selection: selectionManager.selected(),
    });
  });

  win.append(
    await makeBrowserNavigator(emitter, albumDataSource, selectionManager)
  );
  win.append(await makeEditorPage(emitter, selectionManager));
  win.append(await makeButtons(emitter, selectionManager));

  const tab = $(tabHtml);
  // Status change events
  /*$(".new-album-button", tab).on("click", async () => {
    const newAlbum = await question(
      "New album name",
      "Please type the new album name"
    );
    if (newAlbum) {
      const s = await getService();
      s.makeAlbum(newAlbum);
    }
  });*/

  emitter.on("keyDown", (e) => {
    if (e.win === win) {
      if (e.ctrl) {
        if (albumDataSource.shortcuts[e.key]) {
          const target = albumDataSource.shortcuts[e.key];
          getService().then((s) =>
            s.createJob(JOBNAMES.EXPORT, {
              source: selectionManager.selected(),
              destination: target,
            })
          );
          e.preventDefault();
          return true;
        }
      }
      if (
        (e.code === "Backspace" || e.code === "Delete") &&
        selectionManager.selected().length > 0
      ) {
        message(
          t(
            `Do you want to delete $1 files|${
              selectionManager.selected().length
            }`
          ),
          [Button.Ok, Button.Cancel]
        ).then(async (b) => {
          if (b === Button.Ok) {
            const s = await getService();
            s.createJob(JOBNAMES.DELETE, {
              source: selectionManager.selected(),
            });
          }
        });
        return true;
      }
    }
    return false;
  });

  return { win, tab, selectionManager };
}
