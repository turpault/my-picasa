import { ImageController } from "./components/image-controller.js";
import { makeNThumbnails } from "./components/thumbnail.js";
import { Folder } from "./types/types.js";
import { $ } from "./lib/dom.js";

export function folder(f: Folder): HTMLElement {
  const e = document.createElement("li");
  e.innerText = f.name;
  e.id = "folder:" + f.key;

  return e;
}

export function elementByFolder(f: Folder): HTMLElement {
  return $(`#${"folder:" + f.key}`).get();
}

export function folderByElement(
  e: HTMLElement,
  folders: Folder[]
): { index: number; folder: Folder } | undefined {
  const k = e.id.split(":").slice(1).join(":");
  for (let f = 0; f < folders.length; f++) {
    if (folders[f].key == k) {
      return {
        index: f,
        folder: folders[f],
      };
    }
  }
  return undefined;
}

export function picture(): HTMLImageElement {
  const e = document.createElement("img") as HTMLImageElement;
  e.className = "thumbnail";
  return e;
}

export function loadMore(domElement: HTMLElement) {
  makeNThumbnails(domElement, 1);
  const first = domElement.childNodes[0] as HTMLImageElement;
  first.src = "resources/images/loading250.gif";
}

export function toolHeader(
  name: string,
  index: number,
  imageCtrl: ImageController
) {
  const e = $(`<div class="tool-box">
  <div class="w3-bar">
    <a class="w3-bar-item inline">${name}</a>
    <a id="delete" class="inline w3-button w3-bar-item w3-right fa fa-times"></a>
    <a id="up" class="inline w3-button w3-bar-item w3-right fa fa-arrow-up"></a>
    <a id="down" class="inline w3-button w3-bar-item w3-right fa fa-arrow-down"></a>
  </div>
  </div>`);
  $("#delete", e).on("click", () => {
    imageCtrl.deleteOperation(index);
  });
  $("#up", e)
    .on("click", () => {
      imageCtrl.moveDown(index);
    })
    .css(
      "display",
      ...(index < imageCtrl.operationList().length - 1
        ? ["", ""]
        : ["none", "important"])
    );
  $("#down", e)
    .on("click", () => {
      imageCtrl.moveUp(index);
    })
    .css("display", ...(index > 0 ? ["", ""] : ["none", "important"]));
  return e;
}
