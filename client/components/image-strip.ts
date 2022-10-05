import { range, uuid } from "../../shared/lib/utils";
import { AlbumEntry, PicasaFileMeta } from "../../shared/types/types";
import { thumbnailUrl } from "../imageProcess/client";
import { $, elementFromEntry, idFromAlbumEntry, _$ } from "../lib/dom";
import { getService } from "../rpc/connect";
import { ActiveImageManager } from "../selection/active-manager";
import { t } from "./strings";

export async function makeImageStrip(
  e: HTMLElement,
  selector: ActiveImageManager
) {
  const picList = $(".image-strip-thumbs", e);
  const entries = selector.list();

  const maxPic = Math.max(selector.list().indexOf(selector.active()), 15);
  const btns: _$[] = [];
  const prefix = uuid();

  Promise.allSettled(
    entries.map((entry) => thumbnailUrl(entry, "th-small"))
  ).then((results) => {
    for (const idx of range(0, selector.list().length - 1)) {
      const b = $(
        `<button id="${idFromAlbumEntry(entries[idx], prefix)}" class="w3-button strip-btn" loading="lazy" style="background-image: url(${(results[idx] as any).value
        })"></button>`
      );
      b.on("click", () => {
        selector.select(entries[idx]);
      });
      b.addRemoveClass('hidden-strip-btn', idx > maxPic);
      btns.push(b);
      picList.append(b);
    }
    if (maxPic < selector.list().length) {
      const more = $(`<button class="w3-button strip-btn">${t("More...")}</button>`);
      picList.append(more);
      more.on('click', () => {
        for (const btn of btns) {
          btn.addRemoveClass('hidden-strip-btn', false);
        }
        more.addClass('hidden-strip-btn');
      });
    }
  });


  selector.event.on('changed', (event) => {
    const active = elementFromEntry(event, prefix);
    for (const btn of btns) {
      btn.addRemoveClass('active-strip-btn', active.get() === btn.get());
    }
  });

  const s = await getService();
  s.on(
    "picasaFileMetaChanged",
    async (e: { payload: { entry: AlbumEntry; picasa: PicasaFileMeta } }) => {
      const changed = elementFromEntry(e.payload.entry, prefix);
      if (changed.alive()) {
        changed.css({
          "background-image": `url(${thumbnailUrl(e.payload.entry, "th-small")})`
        });
      }
    }
  );
}
