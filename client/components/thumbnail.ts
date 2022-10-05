import { Rectangle, Point } from "ts-2d-geometry";
import { rectanglesIntersect } from "../../shared/lib/utils";
import { Album, AlbumEntry, PicasaFileMeta } from "../../shared/types/types";
import { thumbnailUrl } from "../imageProcess/client";
import {
  $,
  albumEntryFromElement,
  elementFromEntry,
  setIdForEntry,
  _$
} from "../lib/dom";
import { getSettings, getSettingsEmitter } from "../lib/settings";
import { getService } from "../rpc/connect";
import { SelectionManager } from "../selection/selection-manager";
import { AlbumListEventSource } from "../uiTypes";

const elementPrefix = "thumb:";
const imagePrefix = "thumbimg:";

export function buildThumbnail(events: AlbumListEventSource): HTMLElement {
  const e = $(
    `<div class="thumbnail thumbnail-size">
    <img draggable="true" class="th browser-thumbnail" loading="lazy"> <img class="star" src="resources/images/star.svg">
    </div>`
  );
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
        const p = (await s.readPicasaEntry(entry)) as PicasaFileMeta;
        const rank = parseInt(p.rank || "0");
        const selection = SelectionManager.get().selected();
        s.createJob(JOBNAMES.MOVE, {
          source: selection,
          destination: entry.album,
          argument: rank + (side === "left" ? 0 : 1),
        });
        return false;
      });
  }*/
  const img = $(".th", e);
  img.on("click", (ev: any) => {
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
  img.on("dragstart", (ev: any) => {
    const entry = albumEntryFromElement(e, elementPrefix);
    if (entry) {
      SelectionManager.get().select(entry);
      ev.dataTransfer.effectAllowed = "move";
      ev.dataTransfer.setData("text/html", "");
    }
    ev.stopPropagation();
    //ev.preventDefault();
  });
  e.on("dblclick", (ev: any) => {
    const entry = albumEntryFromElement(e, elementPrefix);
    if (!entry) {
      return;
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

  var sheet = Array.from(document.styleSheets).reduce((prev, current) => {
    try {
      return [...prev, ...(Array.from(current.cssRules) as any[])];
    } catch (e) {
      return prev;
    }
  }, [] as any[]);

  const thumbnailRule = sheet.find((p) =>
    p.cssText.includes(".thumbnail-size")
  );
  getSettingsEmitter().on("changed", (event) => {
    if (event.field === "iconSize") {
      thumbnailRule.style.width = `${event.iconSize}px`;
      thumbnailRule.style.height = `${event.iconSize}px`;
    }
  });
  const settings = getSettings();
  thumbnailRule.style.width = `${settings.iconSize}px`;
  thumbnailRule.style.height = `${settings.iconSize}px`;
}
SelectionManager.get().events.on("added", ({ key }) => {
  // Element might be not displayed
  try {
    const e = elementFromEntry(key, elementPrefix);
    if (e.exists())
      e.addClass("selected");
  } catch (e) { }
});
SelectionManager.get().events.on("removed", ({ key }) => {
  // Element might be not displayed
  try {
    const e = elementFromEntry(key, elementPrefix);
    if (e.exists())
      e.removeClass("selected");
  } catch (e) { }
});

export async function thumbnailData(
  e: _$,
  entry: AlbumEntry,
  picasaData: PicasaFileMeta
) {
  const thumb = $("img", e);

  setIdForEntry(e, entry, elementPrefix);
  setIdForEntry(thumb, entry, imagePrefix);

  if (SelectionManager.get().isSelected(entry)) {
    $(e).addClass("selected");
  } else {
    $(e).removeClass("selected");
  }
  thumb.attr("src", thumbnailUrl(entry, "th-medium", true));
  const label = entry.name;
  let dateTime = '';
  if (picasaData.dateTaken) {
    dateTime = new Date(picasaData.dateTaken).toLocaleString();
  }
  e.attr("data-tooltip-above-image", label);
  e.attr("data-tooltip-below-image", dateTime);
  // Async get the thumbnail
  if (picasaData && picasaData.star) {
    $(".star", e).css("display", "");
  } else {
    $(".star", e).css("display", "none");
  }
}

export function selectThumbnailsInRect(
  container: _$,
  p1: { x: number; y: number },
  p2: { x: number; y: number }
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
      const entry = albumEntryFromElement(e, imagePrefix);
      if (entry) SelectionManager.get().select(entry);
    }
  }
}
export function thumbnailsAround(container: _$,
  p: Point): { entry: AlbumEntry, leftOf: boolean } {
  function distanceTo(p: Point, r: Rectangle): { distance: number, leftOf: boolean } {
    // Over an existing one
    if (p.y > r.topLeft.y && p.y < r.bottomRight.y && p.x > r.topLeft.x && p.x < r.bottomRight.x) {
      return { distance: 0, leftOf: true };
    }

    const midPoint = new Point((r.bottomRight.x + r.topLeft.x) / 2, (r.bottomRight.y + r.topLeft.y) / 2);
    let xDelta = p.x - midPoint.x;
    let yDelta = (p.y - midPoint.y) * 10000;
    const d = Math.pow(xDelta, 2) + Math.pow(yDelta, 2);
    return { distance: d, leftOf: p.x < r.bottomRight.x };
  }
  //var rect = container.clientRect();
  //let candidate:AlbumEntry | undefined;
  let d: number = Number.MAX_SAFE_INTEGER;
  const distances: { entry: AlbumEntry, d: { distance: number, leftOf: boolean } }[] = [];
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
    const dist = { entry, d: distanceTo(p, new Rectangle(new Point(r.x, r.y), new Point(r.x + r.width, r.y + r.height))) };
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
  events: AlbumListEventSource
) {
  while (domElement.get().children.length < count) {
    domElement.append(buildThumbnail(events));
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
}
