import { ImageController } from "../components/image-controller.js";
import { ToolRegistrar } from "../components/tools.js";
import { toolHeader } from "../element-templates.js";
import { transform } from "../imageProcess/client.js";
import { $ } from "../lib/dom.js";
import { isPicture } from "../../shared/lib/utils.js";

export function setupRotate(
  imageController: ImageController,
  toolRegistrar: ToolRegistrar
) {
  const name = "Rotate";
  toolRegistrar.registerTool(name, {
    filterName: "rotate",
    enable: (e) => isPicture(e),
    build: function (angle: number) {
      return `${this.filterName}=1,${angle}`;
    },
    icon: async function (context) {
      await transform(context, this.build(1));
      return true;
    },
    activate: async function () {
      imageController.addOperation(this.build(1));
      return true;
    },
    buildUI: function (index: number, args: string[]) {
      const e = toolHeader(name, index, imageController);
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
      return e.get()!;
    },
  });
}
