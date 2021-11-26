import {
  albumEntryFromElement,
  elementFromEntry,
  isVideo,
  rectanglesIntersect,
  setIdForEntry,
  uuid,
} from "../../shared/lib/utils.js";
import {
  AlbumEntry,
  AlbumListEventSource,
  PicasaFileMeta,
} from "../../shared/types/types.js";
import { thumbnailUrl } from "../imageProcess/client.js";
import { $ } from "../lib/dom.js";
import { getService } from "../rpc/connect.js";
import { SelectionManager } from "../selection/selection-manager.js";
import { message } from "./message.js";

const elementPrefix = "thumb:";
const imagePrefix = "thumbimg:";

export function buildThumbnail(events: AlbumListEventSource): HTMLElement {
  const e = $(
    '<div class="thumbnail"> <img class="th" loading="lazy"> <img class="star" src="resources/images/star.svg"></div>'
  );
  e.on("click", (ev: any) => {
    const entry = albumEntryFromElement(ev.target!, imagePrefix);
    if (entry) {
      ev.stopPropagation();
      const { album, name } = entry;

      if (!album.key) return;
      events.emit("clicked", {
        modifiers: {
          range: ev.shiftKey,
          multi: ev.metaKey,
        },
        album,
        name,
      });
    }
  });
  e.on(
    "dragstart",
    (ev: any) => {
      const entry = albumEntryFromElement(ev.target, imagePrefix);
      if (entry) {
        SelectionManager.get().select(entry);
        ev.dataTransfer.effectAllowed = "move";
      }
      //ev.preventDefault();
    },
    false
  );
  e.on("dblclick", (ev: any) => {
    const entry = albumEntryFromElement(ev.target, imagePrefix);
    if (!entry) {
      return;
    }
    if (isVideo(entry)) {
      message("Can't edit videos yet");
      return;
    }
    if (entry) {
      events.emit("open", entry);
    }
  });
  $(".th", e).on("load", (ev) => {
    const thumb = ev.target as HTMLImageElement;
    const ratio = thumb.width / thumb.height;
    const parentSize = {
      width: thumb.parentElement!.clientWidth,
      height: thumb.parentElement!.clientHeight,
    };
    // position the image
    $(thumb).css({
      opacity: "1",
      left: `${ratio > 1 ? 0 : (parentSize.width * (1 - ratio)) / 2}px`,
      top: `${ratio < 1 ? 0 : (parentSize.height * (1 - 1 / ratio)) / 2}px`,
    });
    // position the star at the bottom right
    $(".star", e).css({
      right: `${ratio > 1 ? 0 : (parentSize.width * (1 - ratio)) / 2}px`,
      bottom: `${ratio < 1 ? 0 : (parentSize.height * (1 - 1 / ratio)) / 2}px`,
    });
  });
  return e.get();
}

export async function makeThumbnailManager() {
  const s = await getService();
  s.on(
    "picasaFileMetaChanged",
    async (e: { payload: { entry: AlbumEntry; picasa: PicasaFileMeta } }) => {
      // Is there a thumbnail with that data ?
      const elem = elementFromEntry(e.payload.entry, elementPrefix);
      if (elem) {
        thumbnailData(elem, e.payload.entry, e.payload.picasa);
      }
    }
  );
}
SelectionManager.get().events.on("added", ({ key }) => {
  $(elementFromEntry(key, elementPrefix)!).alive().addClass("selected");
});
SelectionManager.get().events.on("removed", ({ key }) => {
  $(elementFromEntry(key, elementPrefix)!).alive().removeClass("selected");
});

export async function thumbnailData(
  e: HTMLElement,
  entry: AlbumEntry,
  picasaData: PicasaFileMeta
) {
  const thumb = $("img", e);

  setIdForEntry(e, entry, elementPrefix);
  setIdForEntry(thumb.get(), entry, imagePrefix);

  if (SelectionManager.get().isSelected(entry)) {
    $(e).addClass("selected");
  } else {
    $(e).removeClass("selected");
  }
  thumb.attr("src", thumbnailUrl(entry, "th-medium") + "?bust=" + uuid());
  thumb.css("opacity", "0");
  // Async get the thumbnail
  if (picasaData && picasaData.star) {
    $(".star", e).css("display", "");
  } else {
    $(".star", e).css("display", "none");
  }
}

export function selectThumbnailsInRect(
  container: HTMLElement,
  p1: { x: number; y: number },
  p2: { x: number; y: number }
) {
  var rect = container.getBoundingClientRect();
  for (const e of Array.from(container.querySelectorAll(".thumbnail img"))) {
    const r = e.getBoundingClientRect();
    r.x -= rect.x;
    r.y -= rect.y;
    if (
      rectanglesIntersect(
        { p1, p2 },
        {
          p1: r,
          p2: { x: r.x + r.width, y: r.y + r.height },
        }
      )
    ) {
      const entry = albumEntryFromElement(e as HTMLElement, imagePrefix);
      if (entry) SelectionManager.get().select(entry);
    }
  }
}
export function makeNThumbnails(
  domElement: HTMLElement,
  count: number,
  events: AlbumListEventSource
) {
  while (domElement.children.length < count) {
    domElement.appendChild(buildThumbnail(events));
  }
  for (const i of domElement.querySelectorAll(".img")) {
    (i as HTMLImageElement).src = "";
    (i as HTMLImageElement).id = "";
  }
  for (const i of domElement.querySelectorAll(".star")) {
    (i as HTMLImageElement).style.display = "none";
  }
  for (let i = 0; i < domElement.children.length; i++) {
    const e = domElement.children[i] as HTMLImageElement;
    e.id = "";
    e.style.display = i < count ? "" : "none";
  }
}
