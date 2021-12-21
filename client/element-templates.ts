import { ImageController } from "./components/image-controller";
import { $, _$ } from "./lib/dom";
import { Album } from "./types/types";

export function folder(f: Album): _$ {
  const e = $(`<li>${f.name}</li>`);
  return e;
}

export function toolHeader(
  name: string,
  index: number,
  imageCtrl: ImageController
) {
  const e = $(`<div class="tool-box">
  <div class="w3-bar">
    <a class="w3-bar-item inline">${name}</a>
    <a class="delete-tool inline w3-button w3-bar-item w3-right fa fa-times"></a>
    <a class="up-tool inline w3-button w3-bar-item w3-right fa fa-arrow-up"></a>
    <a class="down-tool inline w3-button w3-bar-item w3-right fa fa-arrow-down"></a>
  </div>
  </div>`);
  $(".delete-tool", e).on("click", () => {
    imageCtrl.deleteOperation(index);
  });
  $(".up-tool", e)
    .on("click", () => {
      imageCtrl.moveDown(index);
    })
    .css(
      "display",
      ...((index < imageCtrl.operationList().length - 1
        ? ["", ""]
        : ["none", "important"]) as [string, string])
    );
  $(".down-tool", e)
    .on("click", () => {
      imageCtrl.moveUp(index);
    })
    .css(
      "display",
      ...((index > 0 ? ["", ""] : ["none", "important"]) as [string, string])
    );
  return e;
}
