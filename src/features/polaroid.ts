import { ImageController } from "../components/image-controller.js";
import { ToolRegistrar } from "../components/tools.js";
import { transform } from "../imageProcess/client.js";
import { update } from "../lib/idb-keyval.js";
import { jBone as $ } from "../lib/jbone/jbone.js";

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
      return true;
    },
    buildUI: function (index: number, args: string[]) {
      const e = $(
        `<div>
        <div class="w3-bar">
          <a class="w3-bar-item inline">${name}</a>
          <a id="delete" class="inline w3-button w3-bar-item w3-right">&times;</a>
        </div>
        <div class="slidecontainer">
          <label>Angle</label>
          <input type="range" min="-10" max="10" value="0" id="angle" class="slider">
        </div>
        <div>
          <label for="colorpicker">Background</label>
          <input type="color" id="colorpicker" value="#ffffff">      
        </div>
      <div>
    </div>`
      );
      const update = () => {
        const color = $("#colorpicker", e).val();
        const angle = $("#angle", e).val();
        imageController.updateOperation(index, this.build(angle, color));
      };
      $("#colorpicker", e).val("#" + args[2].slice(2, 8));
      $("#angle", e).val(parseInt(args[1]));

      $("#delete", e).on("click", () => {
        imageController.deleteOperation(index);
      });
      $("#colorpicker", e).on("change", update);
      $("#angle", e).on("change", update);
      return e[0];
    },
  });
}
