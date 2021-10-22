import { Emitter } from "../lib/event";
import { ActiveImageManager } from "../selection/active-manager";
import { ActiveImageEvent, Folder } from "../types/types";
import { jBone as $ } from "../lib/jbone/jbone.js";
import { thumbnail } from "../folder-utils";

export function make(e: HTMLElement, f:Folder, selector:ActiveImageManager)  {
  $("#left", e).on('click', () => {
    selector.selectPrevious();
  });
  $("#right", e).on('click', () => {
    selector.selectPrevious();
  });
  const picList = $("#thumbs", e);
  Promise.all(f.pictures.map(img => thumbnail(f, img.name, "th-small"))).then((thumbnails) => {
    for(const [idx, p] of f.pictures.entries()) {
      const b = $(`<button id="th-${p.name}" class="strip-btn" style="background-image: url(${thumbnails[idx]})"></button>`);
      b.on('click', () => {
        selector.select(p.name);
      });
    }
  });

  selector.event.on("changed", (event: {name: string}) => {
    $(`#th-${event.name}`)[0].scrollIntoView();
  });
}
