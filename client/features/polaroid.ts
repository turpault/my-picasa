import { ImageController } from "../components/image-controller";
import { GENERAL_TOOL_TAB, ToolRegistrar } from "../components/tools";
import { toolHeader } from "../element-templates";
import { transform } from "../imageProcess/client";
import { $ } from "../lib/dom";
import { fromHex, isPicture, toHex2 } from "../../shared/lib/utils";

export function setupPolaroid(
  imageController: ImageController,
  toolRegistrar: ToolRegistrar
) {
  const name = "Polaroid";
  toolRegistrar.registerTool(name, GENERAL_TOOL_TAB, {
    multiple: true,
    filterName: name,
    enable: (e) => isPicture(e),
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
      const e = toolHeader(name, index, imageController, toolRegistrar);

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
      // Convert argb to rgb
      const cols = fromHex(args[2]);
      let rgb: string = args[2];
      if (cols.length === 4) {
        rgb = cols.slice(1).map(toHex2).join("");
      }
      $(".colorpicker", e).val("#" + rgb);
      $(".angle", e).val(parseInt(args[1]));

      $(".colorpicker", e).on("change", update);
      $(".angle", e).on("change", update);
      return { ui: e.get()! };
    },
  });
}
