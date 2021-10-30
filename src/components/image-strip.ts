import { thumbnail } from "../folder-utils.js";
import { jBone as $ } from "../lib/jbone/jbone.js";
import { ActiveImageManager } from "../selection/active-manager.js";
import { FolderInfo } from "../types/types.js";

function nameToId(prefix: string, n: string) {
  return prefix + "_" + n.replace(/[^a-z0-9A-Z_]/g, "");
}
export function make(
  e: HTMLElement,
  f: FolderInfo,
  selector: ActiveImageManager
) {
  $("#previous-image", e).on("click", () => {
    selector.selectPrevious();
  });
  $("#next-image", e).on("click", () => {
    selector.selectNext();
  });
  const picList = $("#image-strip-thumbs", e);
  Promise.allSettled(
    f.pictures.map((img) => thumbnail(f, img.name, "th-small"))
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
        selector.select(p.name);
      });
      picList.append(b);
    }
  });

  selector.event.on("changed", (event: { name: string }) => {
    $(`#${nameToId("th", event.name)}`)[0].scrollIntoView();
  });
}
