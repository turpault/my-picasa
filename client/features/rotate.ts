import { ImageController } from "../components/image-controller";
import { GENERAL_TOOL_TAB, ToolRegistrar } from "../components/tools";
import { toolHeader } from "../element-templates";
import { transform } from "../imageProcess/client";
import { $ } from "../lib/dom";
import { isPicture } from "../../shared/lib/utils";
import { t } from "../components/strings";

export function setupRotate(
  imageController: ImageController,
  toolRegistrar: ToolRegistrar
) {
  const name = t("Rotate");
  toolRegistrar.registerTool(name, GENERAL_TOOL_TAB, {
    multipleFamily: name,
    filterName: "rotate",
    enable: (e) => isPicture(e),
    build: function (angle: number) {
      return {
        name: this.filterName,
        args:['1', angle.toString()]
      }
    },
    icon: async function (context) {
      await transform(context, [this.build(1)]);
      return true;
    },
    activate: async function (index: number, args?: string[]) {
      if (!args) {
        imageController.addOperation(this.build(1));
      }
      return true;
    },
    buildUI: function (index: number, args: string[]) {
      const e = toolHeader(name, index, imageController, toolRegistrar);
      e.append(`<div class="tool-control">
          <label>Type</label>
          <a class="rotate-left w3-button">90 ⟲</a>
          <a class="rotate-right w3-button">90 ⟳</a>
          <a class="rotate-invert w3-button">180 ⟳</a>
        </div>`);
      const update = (angle: number) => {
        imageController.updateOperation(index, this.build(angle));
      };
      let current = parseInt(args[1]);
      if (!Number.isInteger(current)) {
        current = 0;
      }
      $(".rotate-right", e)
        .on("click", () => update(3))
        .css("border", current === 3 ? "solid 1px" : "");
      $(".rotate-left", e)
        .on("click", () => update(1))
        .css("border", current === 1 ? "solid 1px" : "");
      $(".rotate-invert", e)
        .on("click", () => update(2))
        .css("border", current === 2 ? "solid 1px" : "");
      return { ui: e.get()! };
    },
  });
}
