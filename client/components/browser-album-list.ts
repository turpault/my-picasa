import { folder } from "../element-templates";
import { AlbumDataSource } from "../album-data-source";
import {
  $,
  albumFromElement,
  elementFromAlbum,
  setIdForAlbum,
} from "../lib/dom";
import { getService } from "../rpc/connect";
import { SelectionManager } from "../selection/selection-manager";
import { Album } from "../types/types";
import { AlbumListEventSource, AppEventSource } from "../uiTypes";

const elementPrefix = "albumlist:";
const html = `<div class="w3-theme fill folder-pane">
<ul class="folders w3-ul w3-hoverable w3-tiny"></ul>
</div>
`;
export async function makeAlbumList(
  dataSource: AlbumDataSource,
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
  folders.on("click", function (ev): any {
    const album = albumFromElement($(ev.target as HTMLElement), elementPrefix)!;
    events.emit("selected", { album });
  });
  folders.on("dragover", (ev: any) => {
    ev.preventDefault();
  });
  folders.on("dragenter", (ev: any) => {
    $(ev.target).addClass("drop-area");
    ev.preventDefault();
  });
  folders.on("dragleave", (ev: any) => {
    $(ev.target).removeClass("drop-area");
    ev.preventDefault();
  });
  folders.on("drop", async (ev: any) => {
    const selection = SelectionManager.get().selected();
    const album = albumFromElement($(ev.target as HTMLElement), elementPrefix)!;
    const s = await getService();

    s.createJob("move", {
      source: selection,
      destination: album,
    });
    SelectionManager.get().clear();
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
    refreshList();
  });

  const s = await getService();
  s.on("albumChanged", async (e: { payload: Album[] }) => {
    let refresh = false;
    for (const album of e.payload) {
      if (!elementFromAlbum(album, elementPrefix)) {
        refresh = true;
      }
    }
    if (refresh) {
      refreshList();
    }
  });

  async function refreshList() {
    await dataSource.walk(filter);

    folders.empty();
    for (let idx = 0; idx < dataSource.length(); idx++) {
      const aFolder = dataSource.albumAtIndex(idx);
      const node = folder(aFolder);
      setIdForAlbum(node, aFolder, elementPrefix);
      folders.append(node);
    }
    if (firstInit && dataSource.length()) {
      firstInit = false;
      events.emit("selected", { album: dataSource.albumAtIndex(0) });
    }
  }

  refreshList();

  return container;
}
