import { rectanglesIntersect, uuid } from "../../shared/lib/utils";
import { AlbumEntry, PicasaFileMeta } from "../../shared/types/types";
import { thumbnailUrl } from "../imageProcess/client";
import {
  $,
  albumEntryFromElement,
  elementFromEntry,
  setIdForEntry,
  _$,
} from "../lib/dom";
import { getSettings, getSettingsEmitter } from "../lib/settings";
import { getService } from "../rpc/connect";
import { SelectionManager } from "../selection/selection-manager";
import { AlbumListEventSource, AppEventSource } from "../uiTypes";

const elementPrefix = "thumb:";
const imagePrefix = "thumbimg:";

export function buildThumbnail(events: AlbumListEventSource): HTMLElement {
  const e = $(
    '<div class="thumbnail thumbnail-size"> <img class="th" loading="lazy"> <img class="star" src="resources/images/star.svg"></div>'
  );
  e.on("click", (ev: any) => {
    const entry = albumEntryFromElement(
      $(ev.target! as HTMLElement),
      imagePrefix
    );
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
  e.on(
    "dragstart",
    (ev: any) => {
      const entry = albumEntryFromElement(
        $(ev.target! as HTMLElement),
        imagePrefix
      );
      if (entry) {
        SelectionManager.get().select(entry);
        ev.dataTransfer.effectAllowed = "move";
      }
      //ev.preventDefault();
    },
    false
  );
  e.on("dblclick", (ev: any) => {
    const entry = albumEntryFromElement(
      $(ev.target! as HTMLElement),
      imagePrefix
    );
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
    const left = ratio > 1 ? 0 : (parentSize.width * (1 - ratio)) / 2;
    const top = ratio < 1 ? 0 : (parentSize.height * (1 - 1 / ratio)) / 2;
    $(thumb).css({
      opacity: "1",
      left: `${left}px`,
      top: `${top}px`,
    });
    $(thumb).css({
      width: `${parentSize.width - left * 2}px`,
      height: `${parentSize.height - top * 2}px`,
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
    $(elementFromEntry(key, elementPrefix)!).addClass("selected");
  } catch (e) {}
});
SelectionManager.get().events.on("removed", ({ key }) => {
  // Element might be not displayed
  try {
    $(elementFromEntry(key, elementPrefix)!).removeClass("selected");
  } catch (e) {}
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
  container: _$,
  p1: { x: number; y: number },
  p2: { x: number; y: number }
) {
  var rect = container.clientRect();
  for (const e of container.all(".thumbnail img")) {
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
export function makeNThumbnails(
  domElement: _$,
  count: number,
  events: AlbumListEventSource
) {
  while (domElement.get().children.length < count) {
    domElement.append(buildThumbnail(events));
  }
  for (const i of domElement.all(".img")) {
    i.attr("src", "");
    i.id("");
  }
  for (const i of domElement.all(".star")) {
    i.css("display", "none");
  }
  let i = 0;
  for (const e of domElement.children()) {
    e.id("");
    e.css("display", i++ < count ? "" : "none");
  }
}
