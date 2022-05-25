import { ImageController } from "./components/image-controller";
import { ToolRegistrar } from "./components/tools";
import { $, _$ } from "./lib/dom";
import { AlbumWithCount } from "./types/types";

export function folder(f: AlbumWithCount): _$ {
  const e = $(`<li><div class="browser-list-text">${f.name}</div><span class="browser-list-count">(${f.count})</span></li>`);
  return e;
}

export function toolHeader(
  name: string,
  index: number,
  imageCtrl: ImageController,
  toolRegistrar: ToolRegistrar
) {
  const e = $(`<div class="tool-box">
  <div class="w3-bar">
    <a class="w3-bar-item inline">${name}</a>
    <a class="inline delete-tool w3-button w3-bar-item w3-right fa fa-times"></a>
    <a class="inline edit-tool w3-button w3-bar-item w3-right fa fa-pen"></a>
    <a class="inline up-tool w3-button w3-bar-item w3-right fa fa-arrow-up"></a>
    <a class="inline down-tool w3-button w3-bar-item w3-right fa fa-arrow-down"></a>
  </div>
  </div>`);
  $(".delete-tool", e).on("click", () => {
    imageCtrl.deleteOperation(index);
  });
  $(".up-tool", e)
    .on("click", () => {
      imageCtrl.moveDown(index);
    })
    .css({
      display:
        index < imageCtrl.operationList().length - 1
          ? ""
          : ["none", "important"],
    });
  $(".down-tool", e)
    .on("click", () => {
      imageCtrl.moveUp(index);
    })
    .css({
      display: index > 0 ? "" : ["none", "important"],
    });
  $(".edit-tool", e)
    .css({
      display: (toolRegistrar.tool(name) && toolRegistrar.tool(name).editable) ? "" : ["none", "important"],
    })
    .on("click", () => {
      toolRegistrar.edit(index, name);
    });
  return e;
}
