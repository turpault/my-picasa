import { ImageController } from "../components/image-controller";
import { GENERAL_TOOL_TAB, ToolRegistrar } from "../components/tools";
import { toolHeader } from "../element-templates";
import { transform } from "../imageProcess/client";
import { $ } from "../lib/dom";
import { isPicture } from "../../shared/lib/utils";
import { t } from "../components/strings";

export function setupBlur(
  imageController: ImageController,
  toolRegistrar: ToolRegistrar
) {
  const name = t("Blur");
  toolRegistrar.registerTool(name, GENERAL_TOOL_TAB, {
    multipleFamily: name,
    filterName: "blur",
    enable: (e) => isPicture(e),
    build: function (amount: number = 10) {
      return {name: this.filterName, args:['1',amount.toString()]};
    },
    icon: async function (context) {
      await transform(context, [this.build(10)]);
      return true;
    },
    activate: async function (index: number, args?: string[]) {
      if (!args) {
        imageController.addOperation(this.build());
      }
      return true;
    },
    buildUI: function (index: number, args: string[]) {
      const e = toolHeader(name, index, imageController, toolRegistrar);
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
      return { ui: e.get()! };
    },
  });
}
