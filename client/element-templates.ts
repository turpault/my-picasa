import { ImageController } from "./components/image-controller.js";
import { __ } from "./lib/dom.js";
import { albumFromId, idFromAlbum } from "../shared/lib/utils.js";
import { Album } from "./types/types.js";

export function folder(f: Album): HTMLElement {
  const e = document.createElement("li");
  e.innerText = f.name;
  e.id = idFromAlbum(f);
  return e;
}

export function elementByAlbum(f: Album): HTMLElement {
  return __(`#${idFromAlbum(f)}`).get();
}

export function albumByElement(e: HTMLElement): Album | undefined {
  return albumFromId(e.id);
}

export function picture(): HTMLImageElement {
  const e = document.createElement("img") as HTMLImageElement;
  e.className = "thumbnail";
  return e;
}

export function toolHeader(
  name: string,
  index: number,
  imageCtrl: ImageController
) {
  const e = __(`<div class="tool-box">
  <div class="w3-bar">
    <a class="w3-bar-item inline">${name}</a>
    <a class="delete-tool inline w3-button w3-bar-item w3-right fa fa-times"></a>
    <a class="up-tool inline w3-button w3-bar-item w3-right fa fa-arrow-up"></a>
    <a class="down-tool inline w3-button w3-bar-item w3-right fa fa-arrow-down"></a>
  </div>
  </div>`);
  __(".delete-tool", e).on("click", () => {
    imageCtrl.deleteOperation(index);
  });
  __(".up-tool", e)
    .on("click", () => {
      imageCtrl.moveDown(index);
    })
    .css(
      "display",
      ...(index < imageCtrl.operationList().length - 1
        ? ["", ""]
        : ["none", "important"])
    );
  __(".down-tool", e)
    .on("click", () => {
      imageCtrl.moveUp(index);
    })
    .css("display", ...(index > 0 ? ["", ""] : ["none", "important"]));
  return e;
}
