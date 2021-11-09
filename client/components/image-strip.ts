import { albumEntryIndexInList, range } from "../../shared/lib/utils.js";
import { Album, AlbumInfo } from "../../shared/types/types.js";
import { thumbnailUrl } from "../imageProcess/client.js";
import { __, _$ } from "../lib/dom.js";
import { ActiveImageManager } from "../selection/active-manager.js";

const imagesInStrip = 5;
export function makeImageStrip(
  e: HTMLElement,
  album: Album,
  f: AlbumInfo,
  selector: ActiveImageManager
) {
  __(".previous-image", e).on("click", () => {
    selector.selectPrevious();
  });
  __(".next-image", e).on("click", () => {
    selector.selectNext();
  });
  const picList = __(".image-strip-thumbs", e);
  const container = __(e);
  const pics: _$[] = [];
  let offset = 0;
  range(0, imagesInStrip).forEach((idx) => {
    const p = __(`<button class="w3-button strip-btn"></button>`);
    pics.push(p);
    picList.append(p);
    p.on("click", () => {
      selector.select(f.pictures[offset + idx]);
    });
  });
  function update() {
    const urls = range(0, imagesInStrip).map((idx) =>
      thumbnailUrl(f.pictures[idx + offset], "th-small")
    );
    range(0, imagesInStrip).forEach((idx) => {
      pics[idx].attr("src", urls[idx]);
    });
  }

  selector.event.on("changed", (event) => {
    offset = albumEntryIndexInList(event, f.pictures) - 2;
    update();
  });
  update();
}
