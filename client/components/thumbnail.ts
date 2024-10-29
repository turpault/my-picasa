import { Point, Rectangle } from "ts-2d-geometry";
import {
  fromBase64,
  isVideo,
  rectanglesIntersect,
} from "../../shared/lib/utils";
import {
  AlbumEntry,
  AlbumEntryMetaData,
  AlbumEntryPicasa,
  AlbumKind,
} from "../../shared/types/types";
import { thumbnailUrl } from "../imageProcess/client";
import {
  $,
  _$,
  albumEntryFromElement,
  albumEntryFromElementOrChild,
  elementFromEntry,
  setIdForEntry,
} from "../lib/dom";
import { getSettings, getSettingsEmitter } from "../lib/settings";
import { getService } from "../rpc/connect";
import { AlbumEntrySelectionManager } from "../selection/selection-manager";

let lastDraggedOver: _$ | undefined;
let lastSources: _$[] = [];
async function onDragEnd() {
  if (lastDraggedOver) {
    lastDraggedOver.removeClass("thumbnail-dragged-over");
  }
  lastSources.map((e) => e.removeClass("thumbnail-dragged"));
  lastSources.map((e) => e.removeClass("thumbnail-dragged-later"));
}
async function onDrop(
  lastDraggedOverElement: _$,
  lastDraggedOverEntry: AlbumEntry,
  selectionManager: AlbumEntrySelectionManager,
  element: _$,
) {
  // Emulate the move by moving elements
  lastSources.reverse().forEach((e) => {
    e.remove();
    lastDraggedOverElement?.parent()?.insertBefore(e, lastDraggedOverElement);
  });

  const selection = selectionManager.selected();
  if (selection.length === 0) {
    throw new Error("No selection");
  }

  element
    .get()
    .dispatchEvent(
      new CustomEvent("dropEntry", { detail: { entry: lastDraggedOverEntry } }),
    );

  onDragEnd();
}

export function buildThumbnail(
  selectionManager: AlbumEntrySelectionManager,
  elementPrefix: string,
  extraControls?: _$,
): _$ {
  const e = $(
    `<div draggable="true" class="thumbnail thumbnail-size">
      <img class="th browser-thumbnail" loading="lazy"> 
      <div class="star"></div>
    </div>
    `,
  );
  if (extraControls) {
    e.append(extraControls);
  }
  const img = $(".th", e);
  e.on("mouseenter", (_ev: any) => {
    if (img.attr("src-hover")) {
      img.attr("src", img.attr("src-hover"));
    }
  });
  e.on("mouseleave", (_ev: any) => {
    if (img.attr("src-hover") && img.attr("src-original")) {
      img.attr("src", img.attr("src-original"));
    }
  });
  e.on("dragstart", (ev: any) => {
    const entry = albumEntryFromElement(e, elementPrefix);
    if (entry) {
      selectionManager.select(entry);
      ev.dataTransfer.effectAllowed = "move";
      ev.dataTransfer.setData("text/html", "");
      if (selectionManager.selected().length > 0) {
        // Todo multiple select
      }
    }
    lastSources = selectionManager
      .selected()
      .map((entry) => elementFromEntry(entry, elementPrefix));
    lastSources.forEach((e) => e.addClass("thumbnail-dragged"));
    requestAnimationFrame(() => {
      lastSources.forEach((e) => e.addClass("thumbnail-dragged-later"));
    });
    ev.stopPropagation();
    //ev.preventDefault();
  });
  e.on("dragleave", async (ev: DragEvent) => {
    ev.preventDefault();
    //e.removeClass("thumbnail-dragged-over");
    //e.removeClass("padding-margin-right");
  });
  e.on("drop", (_ev) => {
    if (lastDraggedOver) {
      const entry = albumEntryFromElement(lastDraggedOver, elementPrefix);
      if (entry) onDrop(lastDraggedOver, entry, selectionManager, e);
    }
  });
  e.on("dragend", async (ev: DragEvent) => {
    onDragEnd();
    ev.preventDefault();
  });
  e.on("dragover", (_event) => {
    // prevent default to allow drop
    //event.preventDefault();
  });
  e.on("dragenter", async (ev: DragEvent) => {
    ev.preventDefault();
    if (lastSources.find((elem) => elem.get() === e.get())) {
      return;
    }
    // make sure this is the only element that drags on
    if (lastDraggedOver) {
      lastDraggedOver.removeClass("thumbnail-dragged-over");
    }
    lastDraggedOver = e;

    e.addClass("thumbnail-dragged-over");
    return;
  });

  e.on("click", (ev: any) => {
    const entry = albumEntryFromElement(e, elementPrefix);
    if (entry) {
      ev.stopPropagation();

      if (!entry.album.key) return;
      e.get().dispatchEvent(
        new CustomEvent("entryClicked", {
          detail: {
            entry,
            modifiers: {
              range: ev.shiftKey,
              multi: ev.metaKey,
            },
          },
        }),
      );
    }
  });
  e.on("dblclick", async (ev: any) => {
    let entry = albumEntryFromElement(e, elementPrefix);
    if (!entry) {
      return;
    }
    if (entry.album.kind == AlbumKind.FACE) {
      const s = await getService();
      entry = await s.getSourceEntry(entry);
      if (!entry) {
        return;
      }
    }
    e.get().dispatchEvent(
      new CustomEvent("entryDblClicked", { detail: { entry } }),
    );
  });
  $(".th", e).on("load", (ev) => {
    const thumb = ev.target as HTMLImageElement;
    const ratio = thumb.naturalWidth / thumb.naturalHeight;
    const parentSize = {
      width: thumb.parentElement!.clientWidth,
      height: thumb.parentElement!.clientHeight,
    };
    // position the image
    //const left = ratio > 1 ? 0 : (parentSize.width * (1 - ratio)) / 2;
    //const top = ratio < 1 ? 0 : (parentSize.height * (1 - 1 / ratio)) / 2;
    $(thumb).css({
      opacity: "1",
      //left: `${left}px`,
      //top: `${top}px`,
      //width: `${parentSize.width - left * 2}px`,
      //height: `${parentSize.height - top * 2}px`,
    });
    // position the star at the bottom right
    $(".star", e).css({
      right: `${ratio > 1 ? 0 : (parentSize.width * (1 - ratio)) / 2}px`,
      bottom: `${ratio < 1 ? 0 : (parentSize.height * (1 - 1 / ratio)) / 2}px`,
    });
  });
  return e;
}

export async function thumbnailData(
  e: _$,
  entry: AlbumEntry,
  picasaData: AlbumEntryMetaData | undefined,
  selectionManager: AlbumEntrySelectionManager,
  elementPrefix: string,
) {
  const thumb = $("img", e);
  const imagePrefix = "img:" + elementPrefix;

  setIdForEntry(e, entry, elementPrefix);
  setIdForEntry(thumb, entry, imagePrefix);

  if (selectionManager.isSelected(entry)) {
    $(e).addClass("selected");
  } else {
    $(e).removeClass("selected");
  }
  thumb.attr("src", thumbnailUrl(entry, "th-medium", false));
  if (isVideo(entry)) {
    e.attr("is-video", "");
    thumb.attr("src-hover", thumbnailUrl(entry, "th-medium", true));
    thumb.attr("src-original", thumbnailUrl(entry, "th-medium", false));
  } else {
    e.attr("is-video", null);
    thumb.attr("src-hover", null);
    thumb.attr("src-original", null);
  }

  // could be improved
  const label =
    entry.album.kind === AlbumKind.FACE
      ? JSON.parse(fromBase64(entry.name))[0]
      : entry.name;

  let dateTime = "";
  if (picasaData?.dateTaken) {
    dateTime = new Date(picasaData.dateTaken).toLocaleString();
  }
  e.attr("data-tooltip-above-image", label);
  e.attr("data-tooltip-below-image", dateTime);
  // Async get the thumbnail
  if (picasaData && picasaData.star) {
    $(".star", e).css({
      display: "",
      width: `${20 * parseInt(picasaData.starCount || "1")}px`,
    });
  } else {
    $(".star", e).css("display", "none");
  }
}

export function selectThumbnailsInRect(
  container: _$,
  p1: { x: number; y: number },
  p2: { x: number; y: number },
  selectionManager: AlbumEntrySelectionManager,
  elementPrefix: string,
) {
  var rect = container.clientRect();
  for (const e of container.all(".browser-thumbnail")) {
    if (e.get()!.offsetParent === null) {
      continue; // Element is not displayed
    }
    const r = e.clientRect();
    r.x -= rect.x;
    r.y -= rect.y;
    if (
      rectanglesIntersect(
        { p1, p2 },
        {
          p1: r,
          p2: { x: r.x + r.width, y: r.y + r.height },
        },
      )
    ) {
      const entry = albumEntryFromElement(e, elementPrefix);
      if (entry) selectionManager.select(entry);
    }
  }
}

export function entryAboveBelow(
  entry: AlbumEntry,
  elementPrefix: string,
  below: boolean,
): AlbumEntry | null {
  const sel = elementFromEntry(entry, elementPrefix);
  if (sel) {
    const pos = sel.clientRect();
    pos.y += pos.height * (below ? 1.5 : -0.5);
    let pointedElement = document.elementFromPoint(pos.x, pos.y);
    const entry = albumEntryFromElementOrChild(
      $(pointedElement!),
      elementPrefix,
    );
    if (entry) {
      return entry;
    }
    pos.y += pos.height * (below ? -1 : 1);
    pointedElement = document.elementFromPoint(pos.x, pos.y);
    return albumEntryFromElementOrChild($(pointedElement!), elementPrefix);
  }
  return null;
}

export function entryLeftRight(
  entry: AlbumEntry,
  elementPrefix: string,
  right: boolean,
): AlbumEntry | null {
  const sel = elementFromEntry(entry, elementPrefix);
  const n = right ? sel.get().nextSibling : sel.get().previousSibling;

  if (n) {
    return albumEntryFromElement($(n as HTMLElement), elementPrefix);
  }
  return null;
}
