import { ImageController } from "../components/image-controller";
import { t } from "../components/strings";
import { GENERAL_TOOL_TAB, ToolRegistrar } from "../components/tools";
import { PicasaFilter } from "../lib/utils";
import { FilterTool } from "./baseTool";

class BWTool extends FilterTool {
  constructor(controller: ImageController) {
    super(t("Greyscale"), "bw", controller);
  }
  build(): PicasaFilter {
    return { name: this.filterName, args: ["0.5", "0", "0", "#ffffff", "0"] };
  }
}

export function setupBW(
  imageController: ImageController,
  toolRegistrar: ToolRegistrar
) {
  toolRegistrar.registerTool(GENERAL_TOOL_TAB, new BWTool(imageController));
}
