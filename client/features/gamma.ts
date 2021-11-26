import { ImageController } from "../components/image-controller.js";
import { ToolRegistrar } from "../components/tools.js";
import { toolHeader } from "../element-templates.js";
import { transform } from "../imageProcess/client.js";
import { $ } from "../lib/dom.js";

export function setupGamma(
  imageController: ImageController,
  toolRegistrar: ToolRegistrar
) {
  const name = "Gamma";
  toolRegistrar.registerTool(name, {
    filterName: "fill",
    build: function (amount: number) {
      return `${this.filterName}=1,${amount}`;
    },
    icon: async function (context) {
      await transform(context, this.build(0.5));
      return true;
    },
    activate: async function () {
      imageController.addOperation(this.build(0));
      return true;
    },
    buildUI: function (index: number, args: string[]) {
      const e = toolHeader(name, index, imageController);
      e.append(`<div>
      <div class="tool-control slidecontainer">
          <label>Gamma</label>
          <input type="range" min="0" max="100" value="50" class="amount slider">
        </div>
      <div>
    </div></div>`);
      const update = () => {
        const amount = $(".amount", e).val() / 50;
        imageController.updateOperation(index, this.build(amount));
      };
      $(".amount", e).val(parseFloat(args[1]) * 50);

      $(".amount", e).on("change", update);
      return e.get()!;
    },
  });
}
