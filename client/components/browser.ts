import { idFromAlbumEntry } from "../../shared/lib/utils";
import { AlbumEntry, JOBNAMES } from "../../shared/types/types";
import { AlbumIndexedDataSource } from "../album-data-source";
import { $ } from "../lib/dom";
import { State } from "../lib/state";
import { getService } from "../rpc/connect";
import { SelectionManager } from "../selection/selection-manager";
import { AppEventSource } from "../uiTypes";
import { makeBrowserNavigator } from "./browser-navigator";
import { makeButtons } from "./browser-photo-list-buttons";
import { makeEditorPage } from "./editor-page";
import { Button, message } from "./question";
import { SelectionStateDef, makeMetadata } from "./selection-meta";
import { t } from "./strings";

const html = `<div class="browser fill" >
</div>`;

//<button data-tooltip-below="New Album" class="w3-button new-album-button" style="background-image: url(resources/images/icons/actions/new-album-50.png)"></button>
const tabHtml = `<div class="tab-button browser-tab">
<span class="browser-tab-text">${t("Browser")}</span>
</div>`;

export async function makeBrowser(
  emitter: AppEventSource,
  albumDataSource: AlbumIndexedDataSource,
) {
  const win = $(html);
  const selectionManager = new SelectionManager<AlbumEntry>(
    [],
    idFromAlbumEntry,
  );

  selectionManager.events.on("changed", () => {
    emitter.emit("browserSelectionChanged", {
      selection: selectionManager.selected(),
    });
  });

  const state = new State<SelectionStateDef>();
  win.append(
    await makeBrowserNavigator(
      emitter,
      albumDataSource,
      selectionManager,
      state,
    ),
  );
  win.append(await makeEditorPage(emitter, selectionManager, state));
  win.append(await makeButtons(emitter, selectionManager, state));
  const metadata = makeMetadata(selectionManager, state);
  win.append(metadata);

  const tab = $(tabHtml);

  emitter.on("keyDown", async (e) => {
    if (e.win === win) {
      if (e.ctrl) {
        if (albumDataSource.shortcuts[e.key]) {
          const target = albumDataSource.shortcuts[e.key];
          if (
            Button.Ok ===
            (await message(
              t(
                `Are you sure you want to export $1 image(s) to $2 ?|${selectionManager.selected().length}|${target.name}`,
              ),
              [Button.Ok, Button.Cancel],
            ))
          ) {
            e.preventDefault();
            const s = await getService();
            s.createJob(JOBNAMES.EXPORT, {
              source: selectionManager.selected(),
              destination: target,
            });
            return true;
          }
        }
      }
    }
    return false;
  });

  return { win, tab, selectionManager };
}
