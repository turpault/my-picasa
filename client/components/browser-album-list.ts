import {
  Album,
  AlbumChangeEvent,
  AlbumWithCount,
  JOBNAMES
} from "../../shared/types/types";
import { folder } from "../element-templates";
import {
  $,
  albumFromElement,
  elementFromAlbum,
  setIdForAlbum,
  _$
} from "../lib/dom";
import { getService } from "../rpc/connect";
import { SelectionManager } from "../selection/selection-manager";
import { AlbumListEventSource, AppEventSource } from "../uiTypes";

const elementPrefix = "albumlist:";
const html = `<div class="w3-theme fill folder-pane">
<ul class="folders w3-ul w3-hoverable w3-tiny"></ul>
</div>
`;
export async function makeAlbumList(
  appEvents: AppEventSource,
  events: AlbumListEventSource
) {
  const container = $(html);
  let lastHighlight: any;
  let filter = "";
  const folders = $(".folders", container);
  events.on("scrolled", ({ album }) => {
    if (lastHighlight && lastHighlight.is()) {
      lastHighlight.removeClass("highlight-list");
    }
    lastHighlight = $(elementFromAlbum(album, elementPrefix)!);
    if (lastHighlight.is()) {
      lastHighlight.addClass("highlight-list");
      lastHighlight.get().scrollIntoViewIfNeeded(false);
    }
  });
  let firstInit = true;

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

  // list population code
  const albums: AlbumWithCount[] = [];
  function insertionPoint(album: Album): number {
    // todo: filtering
    let insertionPoint = albums.findIndex(
      (a) => a.name.toLowerCase() < album.name.toLowerCase()
    );
    return insertionPoint;
  }
  function addListeners(item: _$) {
    item.on("click", function (ev): any {
      const album = albumFromElement(item, elementPrefix)!;
      events.emit("selected", { album });
    }).on("dragover", (ev: any) => {
      ev.preventDefault();
    }).on("dragenter", (ev: any) => {
      item.addClass("drop-area");
      ev.preventDefault();
    }).on("dragleave", (ev: any) => {
      item.removeClass("drop-area");
      ev.preventDefault();
    }).on("drop", async (ev: any) => {
      const selection = SelectionManager.get().selected();
      const album = albumFromElement(item, elementPrefix)!;
      const s = await getService();
  
      s.createJob(JOBNAMES.MOVE, {
        source: selection,
        destination: {album},
      });
      SelectionManager.get().clear();
    });
  }
  function addAlbum(album: AlbumWithCount) {
    const insert = insertionPoint(album);
    const node = folder(album);
    addListeners(node);
    setIdForAlbum(node, album, elementPrefix);
    if (insert === -1) {
      // at end
      folders.append(node);
      albums.push(album);
    } else {
      const insertBeforeAlbum = albums[insert];
      const sibling = elementFromAlbum(insertBeforeAlbum, elementPrefix);
      if (!sibling.is()) {
        throw new Error(
          "Unknown album to insert before :" + insertBeforeAlbum.name
        );
      }
      folders.insertBefore(node, sibling);
      albums.splice(insert, 0, album);
    }
  }
  function removeAlbum(album: Album) {
    const idx = albums.findIndex((a) => a.key === album.key);
    if (idx != -1) {
      albums.splice(idx, 1);
      elementFromAlbum(album, elementPrefix)!.remove();
    }
  }
  function updateAlbum(album: AlbumWithCount) {
    removeAlbum(album);
    addAlbum(album);
  }
  async function refreshList() {
    if (firstInit) {
      firstInit = false;
      events.emit("selected", { album: albums[0] });
    }
  }
  let gotInitialList = false;
  const s = await getService();
  setTimeout(()=> {
    s.on("albums", async (e: any) => {
      for (const a of e.payload as AlbumWithCount[]) {
        addAlbum(a);
      }
      gotInitialList = true;
    });
    s.monitorAlbums();
    s.on("albumEvent", async (e: any) => {
      if(!gotInitialList) {
        return;
      }
      for (const event of e.payload as AlbumChangeEvent[]) {
        switch (event.type) {
          case "albumDeleted":
            removeAlbum(event.data);
            break;
          case "albumCountUpdated":
            updateAlbum(event.data);
            break;
          case "albumDeleted":
            removeAlbum(event.data);
        }
      }
      // reload list
      refreshList();
    });
  },100);
  return container;
}
