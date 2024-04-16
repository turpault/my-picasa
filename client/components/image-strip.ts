import { $ } from "../lib/dom";
import { AlbumEntrySelectionManager } from "../selection/selection-manager";
import { PicasaEntryCarousel } from "./controls/carousel";

const ImageStrip = `
  <picasa-carousel count="9" class="image-strip"></picasa-carousel>
  `;

export function makeImageStrip(selectionManager: AlbumEntrySelectionManager) {
  const picList = $(ImageStrip).get() as PicasaEntryCarousel;
  picList.setSelectionList(selectionManager);
  return picList;
}
