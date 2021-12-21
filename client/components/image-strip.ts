import { range } from "../../shared/lib/utils";
import { AlbumEntry, PicasaFileMeta } from "../../shared/types/types";
import { thumbnailUrl } from "../imageProcess/client";
import { $ } from "../lib/dom";
import { getService } from "../rpc/connect";
import { ActiveImageManager } from "../selection/active-manager";

function nameToId(prefix: string, n: string) {
  return prefix + "_" + n.replace(/[^a-z0-9A-Z_]/g, "");
}
export async function makeImageStrip(
  e: HTMLElement,
  selector: ActiveImageManager
) {
  $(".previous-image", e).on("click", () => {
    selector.selectPrevious();
  });
  $(".next-image", e).on("click", () => {
    selector.selectNext();
  });
  const picList = $(".image-strip-thumbs", e);
  const entries = selector.list();
  Promise.allSettled(
    entries.map((entry) => thumbnailUrl(entry, "th-small"))
  ).then((results) => {
    for (const idx of range(0, selector.list().length - 1)) {
      const b = $(
        `<button id="${nameToId(
          "th",
          entries[idx].name
        )}" class="w3-button strip-btn" loading="lazy" style="background-image: url(${
          (results[idx] as any).value
        })"></button>`
      );
      b.on("click", () => {
        selector.select(entries[idx]);
      });
      picList.append(b);
    }
  });

  const s = await getService();
  s.on(
    "picasaFileMetaChanged",
    async (e: { payload: { entry: AlbumEntry; picasa: PicasaFileMeta } }) => {
      // Is there a thumbnail with that data ?
      // TODO Update matching thumbnail
    }
  );

  selector.event.on("changed", (event: { name: string }) => {
    const e = $(`#${nameToId("th", event.name)}`);
    if (e.is()) e.get().scrollIntoView();
  });
}
