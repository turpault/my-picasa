import { ActiveImageManager } from "../selection/active-manager.js";
import { Album, AlbumInfo } from "../../shared/types/types.js";
import { thumbnailUrl } from "../imageProcess/client.js";
import { $ } from "../lib/dom.js";

function nameToId(prefix: string, n: string) {
  return prefix + "_" + n.replace(/[^a-z0-9A-Z_]/g, "");
}
export function makeImageStrip(
  e: HTMLElement,
  album: Album,
  f: AlbumInfo,
  selector: ActiveImageManager
) {
  $(".previous-image", e).on("click", () => {
    selector.selectPrevious();
  });
  $(".next-image", e).on("click", () => {
    selector.selectNext();
  });
  const picList = $(".image-strip-thumbs", e);
  Promise.allSettled(
    f.pictures.map((img) => thumbnailUrl({ album, name: img.name }, "th-small"))
  ).then((results) => {
    for (const [idx, p] of f.pictures.entries()) {
      const b = $(
        `<button id="${nameToId(
          "th",
          p.name
        )}" class="w3-button strip-btn" style="background-image: url(${
          (results[idx] as any).value
        })"></button>`
      );
      b.on("click", () => {
        selector.select(p);
      });
      picList.append(b);
    }
  });

  selector.event.on("changed", (event: { name: string }) => {
    $(`#${nameToId("th", event.name)}`)
      .get()
      .scrollIntoView();
  });
}
