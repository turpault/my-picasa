import { Rectangle, Point } from "ts-2d-geometry";
import {
  fromBase64,
  isVideo,
  rectanglesIntersect,
} from "../../shared/lib/utils";
import {
  Album,
  AlbumEntry,
  AlbumEntryPicasa,
  AlbumKind,
  JOBNAMES,
  AlbumEntryMetaData,
} from "../../shared/types/types";
import { thumbnailUrl } from "../imageProcess/client";
import {
  $,
  albumEntryFromElement,
  albumEntryFromElementOrChild,
  elementFromEntry,
  setIdForEntry,
  _$,
} from "../lib/dom";
import { getSettings, getSettingsEmitter } from "../lib/settings";
import { getService } from "../rpc/connect";
import { AlbumEntrySelectionManager } from "../selection/selection-manager";
import { AlbumListEventSource } from "../uiTypes";

let lastDragged: _$ | undefined;
let lastSources: _$[] = [];
export async function onDragEnd() {
  if (lastDragged) {
    lastDragged.removeClass("thumbnail-dragged-over");
  }
  lastSources.map((e) => e.removeClass("thumbnail-dragged"));
  lastSources.map((e) => e.removeClass("thumbnail-dragged-later"));
}
export async function onDrop(
  ev: DragEvent,
  album: Album,
  selectionManager: AlbumEntrySelectionManager,
  elementPrefix: string
) {
  if (lastDragged) {
    ev.preventDefault();

    let entry: AlbumEntry | undefined = albumEntryFromElement(
      lastDragged,
      elementPrefix
    )!;
    // Emulate the move by moving elements
    lastSources.reverse().forEach((e) => {
      e.remove();
      lastDragged?.parent()?.insertBefore(e, lastDragged);
    });

    const selection = selectionManager.selected();
    if (selection.length === 0) {
      throw new Error("No selection");
    }
    if (entry) {
      const s = await getService();

      let rank = 0;
      const p = (await s.getPicasaEntry(entry)) as AlbumEntryMetaData;
      if (p) {
        rank = parseInt(p.rank || "0");
      }

      s.createJob(JOBNAMES.MOVE, {
        source: selection,
        destination: {
          album: album,
          rank,
        },
      });
      selectionManager.clear();
    }
  }
  onDragEnd();
}

function buildThumbnail(
  events: AlbumListEventSource,
  selectionManager: AlbumEntrySelectionManager,
  elementPrefix: string
): HTMLElement {
  const e = $(
    `<div draggable="true" class="thumbnail thumbnail-size">
      <img class="th browser-thumbnail" loading="lazy"> 
      <div class="star"></div>
    </div>
    `
  );
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
  e.on("drop", (ev) => {
    if (lastDragged) {
      const entry = albumEntryFromElement(lastDragged, elementPrefix);
      if (entry) onDrop(ev, entry.album, selectionManager, elementPrefix);
    }
  });
  e.on("dragend", async (ev: DragEvent) => {
    onDragEnd();
    ev.preventDefault();
  });
  e.on("dragover", (event) => {
    // prevent default to allow drop
    event.preventDefault();
  });
  e.on("dragenter", async (ev: DragEvent) => {
    ev.preventDefault();
    if (lastSources.find((elem) => elem.get() === e.get())) {
      return;
    }
    // make sure this is the only element that drags on
    if (lastDragged) {
      lastDragged.removeClass("thumbnail-dragged-over");
    }
    lastDragged = e;

    // See if this is a left or right-ight drag over
    const rect = e.clientRect();
    const mouse = { x: ev.clientX, y: ev.clientY };
    e.addClass("thumbnail-dragged-over");
    return;
  });

  /*for (const side of ["left", "right"]) {
    $(`.thumbnail-drop-area-${side}`, e)
      .on("dragenter", function (ev) {
        $(this).addClass(`thumbnail-drop-area-drag-over-${side}`);
        ev.preventDefault();
      })
      .on("dragover", function (ev) {
        ev.preventDefault();
      })
      .on("dragleave", function () {
        $(this).removeClass(`thumbnail-drop-area-drag-over-${side}`);
      })
      .on("drop", async function (ev) {
        $(this).removeClass(`thumbnail-drop-area-drag-over-${side}`);
        ev.stopPropagation();
        const s = await getService();
        const entry = albumEntryFromElement(e, elementPrefix);
        if (!entry) {
          return;
        }
        const p = (await s.getPicasaEntry(entry)) as PicasaFileMeta;
        const rank = parseInt(p.rank || "0");
        const selection = selectionManager.selected();
        s.createJob(JOBNAMES.MOVE, {
          source: selection,
          destination: entry.album,
          argument: rank + (side === "left" ? 0 : 1),
        });
        return false;
      });
  }*/
  e.on("click", (ev: any) => {
    const entry = albumEntryFromElement(e, elementPrefix);
    if (entry) {
      ev.stopPropagation();

      if (!entry.album.key) return;
      events.emit("thumbnailClicked", {
        modifiers: {
          range: ev.shiftKey,
          multi: ev.metaKey,
        },
        entry,
      });
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
    events.emit("thumbnailDblClicked", {
      entry,
    });
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
  return e.get();
}

export async function makeThumbnailManager(
  elementPrefix: string,
  selectionManager: AlbumEntrySelectionManager
) {
  const s = await getService();
  s.on("albumEntryAspectChanged", async (e: { payload: AlbumEntryPicasa }) => {
    // Is there a thumbnail with that data ?
    const elem = elementFromEntry(e.payload, elementPrefix);
    if (elem.exists()) {
      thumbnailData(
        elem,
        e.payload,
        e.payload.metadata,
        selectionManager,
        elementPrefix
      );
    }
  });

  const root = document.documentElement;

  getSettingsEmitter().on("changed", (event) => {
    if (event.field === "iconSize") {
      root.style.setProperty("--thumbnail-size", `${event.iconSize}px`);
    }
  });
  const settings = getSettings();
  root.style.setProperty("--thumbnail-size", `${settings.iconSize}px`);

  selectionManager.events.on("added", ({ key }) => {
    // Element might be not displayed
    try {
      const e = elementFromEntry(key, elementPrefix);
      if (e.exists()) e.addClass("selected");
    } catch (e) {}
  });
  selectionManager.events.on("removed", ({ key }) => {
    // Element might be not displayed
    try {
      const e = elementFromEntry(key, elementPrefix);
      if (e.exists()) e.removeClass("selected");
    } catch (e) {}
  });
}
export async function thumbnailData(
  e: _$,
  entry: AlbumEntry,
  picasaData: AlbumEntryMetaData | undefined,
  selectionManager: AlbumEntrySelectionManager,
  elementPrefix: string
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
  elementPrefix: string
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
        }
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
  below: boolean
): AlbumEntry | null {
  const sel = elementFromEntry(entry, elementPrefix);
  if (sel) {
    const pos = sel.clientRect();
    pos.y += pos.height * (below ? 1.5 : -0.5);
    let pointedElement = document.elementFromPoint(pos.x, pos.y);
    const entry = albumEntryFromElementOrChild(
      $(pointedElement!),
      elementPrefix
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
  right: boolean
): AlbumEntry | null {
  const sel = elementFromEntry(entry, elementPrefix);
  const n = right ? sel.get().nextSibling : sel.get().previousSibling;

  if (n) {
    return albumEntryFromElement($(n as HTMLElement), elementPrefix);
  }
  return null;
}

export function thumbnailsAround(
  container: _$,
  p: Point,
  elementPrefix: string
): { entry: AlbumEntry; leftOf: boolean } {
  function distanceTo(
    p: Point,
    r: Rectangle
  ): { distance: number; leftOf: boolean } {
    // Over an existing one
    if (
      p.y > r.topLeft.y &&
      p.y < r.bottomRight.y &&
      p.x > r.topLeft.x &&
      p.x < r.bottomRight.x
    ) {
      return { distance: 0, leftOf: true };
    }

    const midPoint = new Point(
      (r.bottomRight.x + r.topLeft.x) / 2,
      (r.bottomRight.y + r.topLeft.y) / 2
    );
    let xDelta = p.x - midPoint.x;
    let yDelta = (p.y - midPoint.y) * 10000;
    const d = Math.pow(xDelta, 2) + Math.pow(yDelta, 2);
    return { distance: d, leftOf: p.x < r.bottomRight.x };
  }
  //var rect = container.clientRect();
  //let candidate:AlbumEntry | undefined;
  let d: number = Number.MAX_SAFE_INTEGER;
  const distances: {
    entry: AlbumEntry;
    d: { distance: number; leftOf: boolean };
  }[] = [];
  for (const e of container.children()) {
    if (e.get()!.offsetParent === null) {
      continue; // Element is not displayed
    }
    if (!e.id()) {
      continue; // in the pool
    }
    const r = e.clientRect();
    //r.x -= rect.x;
    //r.y -= rect.y;
    const entry = albumEntryFromElement(e, elementPrefix)!;
    const dist = {
      entry,
      d: distanceTo(
        p,
        new Rectangle(
          new Point(r.x, r.y),
          new Point(r.x + r.width, r.y + r.height)
        )
      ),
    };
    if (dist.d.distance === 0) {
      // Overlapping, shortcut
      return { entry: dist.entry, leftOf: dist.d.leftOf };
    }
    distances.push(dist);
  }
  distances.sort((a, b) => a.d.distance - b.d.distance);

  return { entry: distances[0].entry, leftOf: distances[0].d.leftOf };
}

export function makeNThumbnails(
  domElement: _$,
  count: number,
  events: AlbumListEventSource,
  selectionManager: AlbumEntrySelectionManager,
  elementPrefix: string
): boolean {
  const countChanged = domElement.get().children.length !== count;
  while (domElement.get().children.length < count) {
    domElement.append(buildThumbnail(events, selectionManager, elementPrefix));
  }
  /*for (const i of domElement.all(".img")) {
    i.attr("src", "");
    i.id("");
  }
  for (const i of domElement.all(".star")) {
    i.css("display", "none");
  }*/
  let i = 0;
  for (const e of domElement.children()) {
    if (i++ < count) {
      e.css("display", "");
    } else {
      e.id("");
      e.css("display", "none");
    }
  }
  return countChanged;
}
