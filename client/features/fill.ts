import { ImageController } from "../components/image-controller";
import { GENERAL_TOOL_TAB, ToolRegistrar } from "../components/tools";
import { toolHeader } from "../element-templates";
import { transform } from "../imageProcess/client";
import { $ } from "../lib/dom";
import { isPicture } from "../../shared/lib/utils";
import { t } from "../components/strings";

export function setupFill(
  imageController: ImageController,
  toolRegistrar: ToolRegistrar
) {
  const name = t("Extra Light");
  toolRegistrar.registerTool(name, GENERAL_TOOL_TAB, {
    multipleFamily: name,
    permanentIndex: 3,
    filterName: "fill",
    enable: (e) => isPicture(e),
    reset: async function (index: number) {
      imageController.updateOperation(index, this.build());
    },
    build: function (amount: number = 0) {
      return {
        name: this.filterName,
        args: ["1", amount.toString()],
      };
    },
    icon: async function (context) {
      await transform(context, [this.build(2)]);
      return true;
    },
    activate: async function (index: number, args?: string[]) {
      if (!args) {
        imageController.addOperation(this.build(0));
      }
      return true;
    },
    buildUI: function (index: number, args: string[]) {
      const e = toolHeader(name, index, imageController, toolRegistrar, this);
      e.append(`<div>
      <div class="tool-control slidecontainer">
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
      return { ui: e.get()! };
    },
  });
}
