import { ImageController } from "../components/image-controller.js";
import { ToolRegistrar } from "../components/tools.js";
import { toolHeader } from "../element-templates.js";
import { transform } from "../imageProcess/client.js";
import { $ } from "../lib/dom.js";

export function setupPolaroid(
  imageController: ImageController,
  toolRegistrar: ToolRegistrar
) {
  const name = "Polaroid";
  toolRegistrar.registerTool(name, {
    filterName: name,
    build: function (angle: number, bgcolor: string) {
      return `${this.filterName}=1,${angle},${bgcolor.replace("#", "")}`;
    },
    icon: async function (context) {
      await transform(context, this.build(10, "#ffffff"));
      return true;
    },
    activate: async function () {
      imageController.addOperation(this.build(10, "#000000"));
      return true;
    },
    buildUI: function (index: number, args: string[]) {
      const e = toolHeader(name, index, imageController);

      e.append(`<div><div class="tool-control slidecontainer">
          <label>Angle</label>
          <input type="range" min="-10" max="10" value="0" class="angle slider">
        </div>
        <div class="tool-control">
          <label >Background</label>
          <input type="color" class="colorpicker" value="#ffffff">      
        </div>
      <div>
    </div>
    </div>`);
      const update = () => {
        const color = $(".colorpicker", e).val();
        const angle = $(".angle", e).val();
        imageController.updateOperation(index, this.build(angle, color));
      };
      $(".colorpicker", e).val("#" + args[2]);
      $(".angle", e).val(parseInt(args[1]));

      $(".colorpicker", e).on("change", update);
      $(".angle", e).on("change", update);
      return e.get()!;
    },
  });
}
