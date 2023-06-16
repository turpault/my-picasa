import { Album, JOBNAMES } from "../../shared/types/types";
import { AlbumIndexedDataSource } from "../album-data-source";
import { folder, folderData } from "../element-templates";
import {
  $,
  _$,
  albumFromElement,
  elementFromAlbum,
  setIdForAlbum,
} from "../lib/dom";
import { getService } from "../rpc/connect";
import { AlbumEntrySelectionManager } from "../selection/selection-manager";
import { AppEventSource } from "../uiTypes";
import { makeButtons } from "./browser-photo-list-buttons";

const elementPrefix = "albumlist:";
const html = `<div class="w3-theme fill folder-pane">
<ul class="folders w3-ul w3-hoverable w3-tiny"></ul>
</div>
`;
export async function makeAlbumList(
  appEvents: AppEventSource,
  albumDataSource: AlbumIndexedDataSource,
  selectionManager: AlbumEntrySelectionManager
) {
  const container = $(html);
  await makeButtons(appEvents);

  let lastHighlight: any;
  let filter = "";
  const folders = $(".folders", container);
  const events = albumDataSource.emitter;
  let lastSelectedAlbum: Album | undefined;
  const albums: _$[] = [];

  container.attachData(
    events.on("scrolled", ({ album }) => {
      lastSelectedAlbum = album;
      if (lastHighlight && lastHighlight.exists()) {
        lastHighlight.removeClass("highlight-list");
      }
      lastHighlight = elementFromAlbum(album, elementPrefix);
      if (lastHighlight.exists()) {
        lastHighlight.addClass("highlight-list");
        lastHighlight.get().scrollIntoViewIfNeeded(false);
      }
    }),
    appEvents.on("keyDown", ({ code, win }) => {
      if (win.isParent(container))
        switch (code) {
          case "Space":
          default:
        }
    }),

    events.on("filterChanged", (event) => {
      filter = event.filter;
      albumDataSource.setFilter(filter);
    }),

    events.on("invalidateFrom", (event) => {
      const wasEmpty = albums.length === 0;
      const toRemove = albums.splice(event.index);
      toRemove.forEach((elem) => elem.remove());
      for (let idx = event.index; idx < albumDataSource.length(); idx++) {
        const album = albumDataSource.albumAtIndex(idx);
        const node = folder();
        folderData(node, album);
        node.attr("separator", album.head || null);
        setIdForAlbum(node, album, elementPrefix);
        addListeners(node);
        albums.push(node);
        folders.append(node);

        if (wasEmpty && idx === 0) {
          events.emit("selected", { album });
        }
      }
    }),
    events.on("invalidateAt", (event) => {
      const album = albumDataSource.albumAtIndex(event.index);
      const toUpdate = elementFromAlbum(album, elementPrefix);
      if (toUpdate) {
        folderData(toUpdate, album);
      }
    })
  );

  function addListeners(item: _$) {
    const img = new Image();
    img.src = "resources/images/icons/actions/duplicate-50.png";
    item
      .on("click", function (ev): any {
        const album = albumFromElement(item, elementPrefix)!;
        lastSelectedAlbum = album;
        events.emit("selected", { album });
      })
      .on("dragover", (ev: any) => {
        //console.info("dragover");
        ev.preventDefault();
      })
      .on("dragenter", (ev: any) => {
        if (ev.currentTarget.contains(ev.relatedTarget)) {
          return;
        }
        console.info("dragenter");
        item.addClass("drop-area");
        ev.dataTransfer.setDragImage(img, 10, 10);
      })
      .on("dragleave", (ev: any) => {
        if (ev.currentTarget.contains(ev.relatedTarget)) {
          return;
        }
        console.info("dragleave");
        item.removeClass("drop-area");
        ev.preventDefault();
      })
      .on("drop", async (ev: any) => {
        console.info("drop");
        const selection = selectionManager.selected();
        const album = albumFromElement(item, elementPrefix)!;
        const s = await getService();

        s.createJob(JOBNAMES.MOVE, {
          source: selection,
          destination: { album },
        });
        selectionManager.clear();
      });
  }

  return container;
}
