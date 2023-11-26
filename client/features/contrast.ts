import { PicasaFilter } from "../../shared/lib/utils";
import { ImageController } from "../components/image-controller";
import { t } from "../components/strings";
import { GENERAL_TOOL_TAB, ToolRegistrar } from "../components/tools";
import { $, _$ } from "../lib/dom";
import { Tool } from "./baseTool";

class ContrastTool extends Tool {
  private e: _$;
  constructor(controller: ImageController) {
    super(t("Contrast"), "contrast", controller);

    this.e = $(`<div>
    <div class="tool-control slidecontainer">
        <label>Constrast level</label>
        <input type="range" min="0" max="200" value="100" class="amount slider">
      </div>
    <div>
  </div></div>`);
    const update = () => {
      const amount = $(".amount", this.e).val();
      controller.updateOperation(this.build(amount));
    };

    $(".amount", this.e).on("change", update);
  }
  build(amount: number) {
    return {
      name: this.filterName,
      args: ["1", amount.toString()],
    };
  }
  update(operationList: PicasaFilter[], _thumbnailContext: string) {
    const o = operationList.find((f) => f.name === this.filterName);
    $(".amount", this.e).val(parseInt(o?.args[1] || "0"));
  }
  ui() {
    return this.e;
  }
}

export function setupContrast(
  imageController: ImageController,
  toolRegistrar: ToolRegistrar
) {
  const name = t("Contrast");
  toolRegistrar.registerTool(
    GENERAL_TOOL_TAB,
    new ContrastTool(imageController)
  );
}
