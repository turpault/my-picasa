import { ImageController } from "../components/image-controller";
import { GENERAL_TOOL_TAB, ToolRegistrar } from "../components/tools";
import { toolHeader } from "../element-templates";
import { transform } from "../imageProcess/client";
import { $ } from "../lib/dom";
import { isPicture } from "../../shared/lib/utils";
import { t } from "../components/strings";

export function setupBrightness(
  imageController: ImageController,
  toolRegistrar: ToolRegistrar
) {
  const name = t("Brightness");
  toolRegistrar.registerTool(name, GENERAL_TOOL_TAB, {
    multipleFamily: name,
    filterName: "finetune2",
    enable: (e) => isPicture(e),
    build: function (
      brightness: number,
      highlights: number,
      shadows: number,
      colorTemp: string,
      amount: number
    ) {
      return {
        name: this.filterName,
        args: [
          "1",
          brightness.toString(),
          highlights.toString(),
          shadows.toString(),
          colorTemp.replace("#", ""),
          amount.toString(),
        ],
      };
    },
    icon: async function (context) {
      await transform(context, [this.build(0.5, 0, 0, "#ffffff", 0)]);
      return true;
    },
    activate: async function (index: number, args?: string[]) {
      if (!args) {
        imageController.addOperation(this.build(0, 0, 0, "#ffffff", 0));
      }
      return true;
    },
    buildUI: function (index: number, args: string[]) {
      const e = toolHeader(name, index, imageController, toolRegistrar, this);
      e.append(`<div><div class="tool-control slidecontainer">
          <label>Brightness</label>
          <input type="range" min="0" max="100" value="0" class="brightness slider">
        </div>
        <div class="tool-control slidecontainer">
          <label>Highlights</label>
          <input type="range" min="0" max="100" value="0" class="highlights slider">
        </div>
        <div class="tool-control slidecontainer">
          <label>Shadows</label>
          <input type="range" min="0" max="100" value="0" class="shadows slider">
        </div>
        <div class="tool-control">
          <label>Neutral Point</label>
          <input type="color" class="colorpicker" value="#ffffff">      
          <label>Amount</label>
          <input type="range" min="0" max="100" value="0" class="amount slider">
        </div>
      <div>
    </div></div>`);
      const update = () => {
        const brightness = $(".brightness", e).val() / 100;
        const highlights = $(".highlights", e).val() / 100;
        const shadows = $(".shadows", e).val() / 100;
        const color = $(".colorpicker", e).val();
        const amount = $(".amount", e).val() / 100;
        imageController.updateOperation(
          index,
          this.build(brightness, highlights, shadows, color, amount)
        );
      };
      $(".brightness", e).val(parseFloat(args[1]) * 100);
      $(".highlights", e).val(parseFloat(args[2]) * 100);
      $(".shadows", e).val(parseFloat(args[3]) * 100);
      $(".colorpicker", e).val("#" + args[4]);
      $(".amount", e).val(parseFloat(args[5]) * 100);

      $(".brightness", e).on("change", update);
      $(".highlights", e).on("change", update);
      $(".shadows", e).on("change", update);
      $(".colorpicker", e).on("change", update);
      $(".amount", e).on("change", update);
      return { ui: e.get()! };
    },
  });
}
