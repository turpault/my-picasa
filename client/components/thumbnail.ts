import { albumEntryFromId, idFromAlbumEntry } from "../../shared/lib/utils.js";
import {
  AlbumEntry,
  AlbumListEventSource,
  PicasaFolderMeta,
} from "../../shared/types/types.js";
import { thumbnailUrl } from "../imageProcess/client.js";
import { __ } from "../lib/dom.js";
import { SelectionManager } from "../selection/selection-manager.js";

export function buildThumbnail(events: AlbumListEventSource): HTMLElement {
  const e = __('<div class="thumbnail"> <img></div>');
  e.on("click", (ev: any) => {
    const { album, name } = albumEntryFromId(ev.target!.id);
    if (!name) {
      return;
    }
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
  __("#" + id)
    .alive()
    .addClass("selected");
});
SelectionManager.get().events.on("removed", ({ key }) => {
  const id = idFromAlbumEntry(key);
  __("#" + id)
    .alive()
    .removeClass("selected");
});

export function thumbnailData(
  e: HTMLElement,
  entry: AlbumEntry,
  picasaData: PicasaFolderMeta
) {
  const id = idFromAlbumEntry(entry);
  const thumb = __("img", e);
  if (SelectionManager.get().isSelected(entry)) {
    thumb.addClass("selected");
  } else {
    thumb.removeClass("selected");
  }
  thumb.get().id = id;
  const i = new Image();
  i.src = thumbnailUrl(entry);
  i.onload = () => {
    if (thumb.get().id === id) {
      thumb.css({
        "margin-left": `-${i.width}px`,
        "margin-top": `-${i.height}px`,
      });
      thumb.attr("src", i.src);
    }
  };
  if (picasaData[entry.name] && picasaData[entry.name].star) {
    thumb.addClass("star");
  } else {
    thumb.removeClass("star");
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
  for (const [idx, e] of Object.entries(domElement.querySelectorAll("img"))) {
    e.src = "";
    e.id = "";
  }
  // Hide/show elements
  for (const [idx, e] of Object.entries(
    domElement.querySelectorAll(".thumbnail")
  )) {
    //__(e).css("display", parseInt(idx) < count ? "" : "none");
  }
}
