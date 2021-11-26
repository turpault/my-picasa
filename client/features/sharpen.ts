import { ImageController } from "../components/image-controller.js";
import { ToolRegistrar } from "../components/tools.js";
import { toolHeader } from "../element-templates.js";
import { transform } from "../imageProcess/client.js";
import { $ } from "../lib/dom.js";

export function setupSharpen(
  imageController: ImageController,
  toolRegistrar: ToolRegistrar
) {
  const name = "Sharpen";
  toolRegistrar.registerTool(name, {
    filterName: "sharpen",
    build: function (amount: number) {
      return `${this.filterName}=1,${amount}`;
    },
    icon: async function (context) {
      await transform(context, this.build(10));
      return true;
    },
    activate: async function () {
      imageController.addOperation(this.build(10));
      return true;
    },
    buildUI: function (index: number, args: string[]) {
      const e = toolHeader(name, index, imageController);
      e.append(`<div>
      <div class="tool-control slidecontainer">
          <label>Radius</label>
          <input type="range" min="1" max="1000" value="10" class="amount slider">
        </div>
      <div>
    </div></div>`);
      const update = () => {
        const amount = $(".amount", e).val() / 100;
        imageController.updateOperation(index, this.build(amount));
      };
      $(".amount", e).val(parseFloat(args[1]) * 100);

      $(".amount", e).on("change", update);
      return e.get()!;
    },
  });
}
