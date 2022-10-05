import { JOBNAMES } from "../../shared/types/types";
import { AlbumIndexedDataSource } from "../album-data-source";
import { folder } from "../element-templates";
import {
  $,
  albumFromElement,
  elementFromAlbum,
  setIdForAlbum,
  _$,
} from "../lib/dom";
import { getService } from "../rpc/connect";
import { SelectionManager } from "../selection/selection-manager";
import { AppEventSource } from "../uiTypes";
import { makeButtons } from "./browser-photo-list-buttons";

const elementPrefix = "albumlist:";
const html = `<div class="w3-theme fill folder-pane">
<ul class="folders w3-ul w3-hoverable w3-tiny"></ul>
</div>
`;
export async function makeAlbumList(
  appEvents: AppEventSource,
  albumDataSource: AlbumIndexedDataSource
) {

  const container = $(html);
  container.append(await makeButtons(appEvents, albumDataSource.emitter));

  let lastHighlight: any;
  let filter = "";
  const folders = $(".folders", container);
  const events = albumDataSource.emitter;
  events.on("scrolled", ({ album }) => {
    if (lastHighlight && lastHighlight.is()) {
      lastHighlight.removeClass("highlight-list");
    }
    lastHighlight = elementFromAlbum(album, elementPrefix);
    if (lastHighlight.is()) {
      lastHighlight.addClass("highlight-list");
      lastHighlight.get().scrollIntoViewIfNeeded(false);
    }
  });

  appEvents.on("keyDown", ({ code, win }) => {
    if (win.isParent(container))
      switch (code) {
        case "Space":
        default:
      }
  });

  events.on("filterChanged", (event) => {
    filter = event.filter;
  });

  const albums: _$[] = [];
  events.on("invalidateFrom", (event) => {
    const wasEmpty = albums.length === 0;
    const toRemove = albums.splice(event.index);
    toRemove.forEach((elem) => elem.remove());
    for (let idx = event.index; idx < albumDataSource.length(); idx++) {
      const album = albumDataSource.albumAtIndex(idx);
      const node = folder(album);
      setIdForAlbum(node, album, elementPrefix);
      addListeners(node);
      albums.push(node);
      folders.append(node);

      if (wasEmpty && idx === 0) {
        events.emit("selected", { album });
      }
    }
  });
  events.on("invalidateAt", (event) => {
    // TODO
  });

  function addListeners(item: _$) {
    item
      .on("click", function (ev): any {
        const album = albumFromElement(item, elementPrefix)!;
        events.emit("selected", { album });
      })
      .on("dragover", (ev: any) => {
        ev.preventDefault();
      })
      .on("dragenter", (ev: any) => {
        item.addClass("drop-area");
        ev.preventDefault();
      })
      .on("dragleave", (ev: any) => {
        item.removeClass("drop-area");
        ev.preventDefault();
      })
      .on("drop", async (ev: any) => {
        const selection = SelectionManager.get().selected();
        const album = albumFromElement(item, elementPrefix)!;
        const s = await getService();

        s.createJob(JOBNAMES.MOVE, {
          source: selection,
          destination: { album },
        });
        SelectionManager.get().clear();
      });
  }

  return container;
}
