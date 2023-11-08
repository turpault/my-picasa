import { idFromAlbumEntry, range, uuid } from "../../shared/lib/utils";
import { AlbumEntryPicasa } from "../../shared/types/types";
import { thumbnailUrl } from "../imageProcess/client";
import { $, _$, elementFromEntry } from "../lib/dom";
import { getService } from "../rpc/connect";
import { ActiveImageManager } from "../selection/active-manager";
import { t } from "./strings";

export async function makeImageStrip(e: _$, selector: ActiveImageManager) {
  const picList = $(".image-strip-thumbs", e);
  const entries = selector.list();

  const maxPic = Math.max(selector.list().indexOf(selector.active()), 15);
  const btns: _$[] = [];
  const prefix = uuid();
  const s = await getService();

  const clearFct: Function[] = [];

  Promise.allSettled(
    entries.map((entry) => thumbnailUrl(entry, "th-small"))
  ).then((results) => {
    for (const idx of range(0, selector.list().length - 1)) {
      const id = idFromAlbumEntry(entries[idx], prefix);
      const b = $(
        `<button id="${id}" class="w3-button strip-btn" loading="lazy" style="background-image: url(${
          (results[idx] as any).value
        })"></button>`
      );
      b.on("click", () => {
        selector.select(entries[idx]);
      });
      b.addRemoveClass("hidden-strip-btn", idx > maxPic);
      btns.push(b);
      picList.append(b);
    }
    if (maxPic < selector.list().length) {
      const more = $(
        `<button class="w3-button strip-btn">${t("More...")}</button>`
      );
      picList.append(more);
      more.on("click", () => {
        for (const btn of btns) {
          btn.addRemoveClass("hidden-strip-btn", false);
        }
        more.addClass("hidden-strip-btn");
      });
    }
  });

  clearFct.push(
    selector.event.on("changed", (event) => {
      const active = elementFromEntry(event, prefix);
      for (const btn of btns) {
        btn.addRemoveClass("active-strip-btn", active.get() === btn.get());
      }
    })
  );

  clearFct.push();
  return () => clearFct.map((f) => f());
}
