import {
  AlbumListEventSource,
  Album,
  AlbumEntry,
} from "../../shared/types/types.js";
import { thumbnailUrl } from "../imageProcess/client.js";
import { $ } from "../lib/dom.js";
import { Directory } from "../lib/handles.js";
import {
  albumEntryFromId,
  albumFromId,
  idFromAlbum,
  idFromAlbumEntry,
} from "../../shared/lib/utils.js";
import { SelectionManager } from "../selection/selection-manager.js";

export function makeThumbnail(events: AlbumListEventSource): HTMLElement {
  const e = $(document.createElement("span") as HTMLImageElement);
  e.addClass("thumbnail w3-button w3-ripple");
  e.attr("draggable", "true");

  e.on("click", (ev: any) => {
    if (!ev.shiftKey) {
      SelectionManager.get().clear();
    }
    SelectionManager.get().select(ev.target.id);
  });
  e.on("dblclick", (ev: any) => {
    const { album, name } = albumEntryFromId(ev.target.id);
    events.emit("open", { album, name });
  });
  return e.get();
}

SelectionManager.get().events.on("added", ({ key }) => {
  $("#" + key)
    .alive()
    .addClass("selected");
});
SelectionManager.get().events.on("removed", ({ key }) => {
  $("#" + key)
    .alive()
    .removeClass("selected");
});

export function thumbnailData(e: HTMLElement, entry: AlbumEntry) {
  const id = idFromAlbumEntry(entry);
  e.id = id;
  e.style.backgroundImage = 'url("resources/images/loading250.gif")';
  thumbnailUrl(entry).then((img) => {
    if (e.id === id) {
      e.style.backgroundImage = `url("${img}")`;
    }
  });
  return e;
}

export function makeNThumbnails(
  domElement: HTMLElement,
  count: number,
  events: AlbumListEventSource
) {
  while (domElement.children.length < count) {
    domElement.appendChild(makeThumbnail(events));
  }
  for (let i = 0; i < domElement.children.length; i++) {
    (domElement.children[i] as HTMLImageElement).style.backgroundImage = "";
    (domElement.children[i] as HTMLImageElement).style.display =
      i < count ? "" : "none";
  }
}
