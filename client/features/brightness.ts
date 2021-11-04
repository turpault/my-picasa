import { ImageController } from "../components/image-controller.js";
import { ToolRegistrar } from "../components/tools.js";
import { toolHeader } from "../element-templates.js";
import { transform } from "../imageProcess/client.js";
import { $ } from "../lib/dom.js";

export function setupBrightness(
  imageController: ImageController,
  toolRegistrar: ToolRegistrar
) {
  const name = "Brightness";
  toolRegistrar.registerTool(name, {
    filterName: "finetune2",
    build: function (
      brightness: number,
      highlights: number,
      shadows: number,
      colorTemp: string,
      amount: number
    ) {
      return `${
        this.filterName
      }=1,${brightness},${highlights},${shadows},${colorTemp.replace(
        "#",
        ""
      )},${amount}`;
    },
    icon: async function (context) {
      await transform(context, this.build(0.5, 0, 0, "#ffffff", 0));
      return true;
    },
    activate: async function () {
      imageController.addOperation(this.build(0, 0, 0, "#ffffff", 0));
      return true;
    },
    buildUI: function (index: number, args: string[]) {
      const e = toolHeader(name, index, imageController);
      e.append(`<div><div class="tool-control slidecontainer">
          <label>Brightness</label>
          <input type="range" min="0" max="100" value="0" id="brightness" class="slider">
        </div>
        <div class="tool-control slidecontainer">
          <label>Highlights</label>
          <input type="range" min="0" max="100" value="0" id="highlights" class="slider">
        </div>
        <div class="tool-control slidecontainer">
          <label>Shadows</label>
          <input type="range" min="0" max="100" value="0" id="shadows" class="slider">
        </div>
        <div class="tool-control">
          <label for="colorpicker">Tint</label>
          <input type="color" id="colorpicker" value="#ffffff">      
          <label>Amount</label>
          <input type="range" min="0" max="100" value="0" id="amount" class="slider">
        </div>
      <div>
    </div></div>`);
      const update = () => {
        const brightness = $("#brightness", e).val() / 100;
        const highlights = $("#highlights", e).val() / 100;
        const shadows = $("#shadows", e).val() / 100;
        const color = $("#colorpicker", e).val();
        const amount = $("#amount", e).val() / 100;
        imageController.updateOperation(
          index,
          this.build(brightness, highlights, shadows, color, amount)
        );
      };
      $("#brightness", e).val(parseFloat(args[1]) * 100);
      $("#highlights", e).val(parseFloat(args[2]) * 100);
      $("#shadows", e).val(parseFloat(args[3]) * 100);
      $("#colorpicker", e).val("#" + args[4]);
      $("#amount", e).val(parseFloat(args[5]) * 100);

      $("#brightness", e).on("change", update);
      $("#highlights", e).on("change", update);
      $("#shadows", e).on("change", update);
      $("#colorpicker", e).on("change", update);
      $("#amount", e).on("change", update);
      return e.get()!;
    },
  });
}
