import { albumEntryFromId, idFromAlbumEntry } from "../../shared/lib/utils.js";
import {
  AlbumEntry,
  AlbumListEventSource,
  PicasaFolderMeta,
} from "../../shared/types/types.js";
import { thumbnailUrl } from "../imageProcess/client.js";
import { $ } from "../lib/dom.js";
import { SelectionManager } from "../selection/selection-manager.js";

export function buildThumbnail(events: AlbumListEventSource): HTMLElement {
  const e = $(
    '<div class="thumbnail"> <img> <span class="fas fa-star star"></span></div>'
  );
  e.on("click", (ev: any) => {
    const { album, name } = albumEntryFromId(ev.target!.id);
    events.emit("clicked", {
      modifiers: {
        range: ev.shiftKey,
        multi: ev.metaKey,
      },
      album,
      name,
      sourceElementId: ev.target!.id,
    });
  });
  e.on("dblclick", (ev: any) => {
    const { album, name } = albumEntryFromId(ev.target.id);
    events.emit("open", { album, name });
  });
  return e.get();
}

SelectionManager.get().events.on("added", ({ key }) => {
  const id = idFromAlbumEntry(key);
  $("#" + id)
    .alive()
    .addClass("selected");
});
SelectionManager.get().events.on("removed", ({ key }) => {
  const id = idFromAlbumEntry(key);
  $("#" + id)
    .alive()
    .removeClass("selected");
});

export function thumbnailData(
  e: HTMLElement,
  entry: AlbumEntry,
  picasaData: PicasaFolderMeta
) {
  const id = idFromAlbumEntry(entry);
  const thumb = $("img", e);
  if (SelectionManager.get().isSelected(entry)) {
    thumb.addClass("selected");
  } else {
    thumb.removeClass("selected");
  }
  e.id = id;
  thumb.attr("src", "resources/images/loading250.gif");
  thumbnailUrl(entry).then((img) => {
    if (e.id === id) {
      thumb.attr("src", img);
    }
  });
  if (picasaData[entry.name] && picasaData[entry.name].star) {
    $(".star", e).css("display", "");
  } else {
    $(".star", e).css("display", "none");
  }

  return e;
}

export function makeNThumbnails(
  domElement: HTMLElement,
  count: number,
  events: AlbumListEventSource
) {
  while (domElement.children.length < count) {
    domElement.appendChild(buildThumbnail(events));
  }
  for (let i = 0; i < domElement.children.length; i++) {
    (domElement.children[i] as HTMLImageElement).style.backgroundImage = "";
    domElement.children[i].id = "";
    (domElement.children[i] as HTMLImageElement).style.display =
      i < count ? "" : "none";
  }
}
