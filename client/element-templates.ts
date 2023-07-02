import { ImageController } from "./components/image-controller";
import { t } from "./components/strings";
import { ToolRegistrar } from "./components/tools";
import { $ } from "./lib/dom";
import { Tool } from "./uiTypes";

export function toolHeader(
  displayName: string,
  index: number,
  imageCtrl: ImageController,
  toolRegistrar: ToolRegistrar,
  tool: Tool
) {
  const e = $(`<div class="tool-box">
  <div class="w3-bar">
    <a class="w3-bar-item inline">${displayName}</a>
    <a class="inline reset-tool w3-button w3-bar-item w3-right">${t(
      "Reset"
    )}</a>
    <a class="inline delete-tool w3-button w3-bar-item w3-right fa fa-times"></a>
    <a class="inline edit-tool w3-button w3-bar-item w3-right">${t(
      "Modify"
    )}</a>
    <a class="inline up-tool w3-button w3-bar-item w3-right fa fa-arrow-up"></a>
    <a class="inline down-tool w3-button w3-bar-item w3-right fa fa-arrow-down"></a>
  </div>
  </div>`);
  $(".delete-tool", e)
    .css({
      display: tool.permanentIndex !== undefined ? ["none", "important"] : "",
    })
    .on("click", () => {
      imageCtrl.deleteOperation(index);
    });
  $(".up-tool", e)
    .on("click", () => {
      imageCtrl.moveDown(index);
    })
    .css({
      display:
        tool.permanentIndex !== undefined
          ? ["none", "important"]
          : index < imageCtrl.operationList().length - 1
          ? ""
          : ["none", "important"],
    });
  $(".down-tool", e)
    .on("click", () => {
      imageCtrl.moveUp(index);
    })
    .css({
      display:
        tool.permanentIndex !== undefined
          ? ["none", "important"]
          : index > 0
          ? ""
          : ["none", "important"],
    });
  $(".edit-tool", e)
    .css({
      display: tool.editable ? "" : ["none", "important"],
    })
    .on("click", () => {
      toolRegistrar.edit(index, displayName);
    });
  $(".reset-tool", e)
    .css({
      display: tool.reset ? "" : ["none", "important"],
    })
    .on("click", () => {
      toolRegistrar.reset(index, displayName);
    });
  return e;
}
