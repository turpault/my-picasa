import { ImageController } from "../components/image-controller";
import { t } from "../components/strings";
import { PAGES, ToolRegistrar } from "../components/tools";

import { ToolEditor } from "../components/tool-editor";
import { ParametrizableTool } from "./baseTool";

export function setupBrightness(
  controller: ImageController,
  toolRegistrar: ToolRegistrar,
  editor: ToolEditor
) {
  toolRegistrar.registerTool(
    PAGES.CONTRAST,
    new ParametrizableTool(t("Brightness"), "finetune2", controller, editor, [
      {
        name: "Brightness",
        type: "range",
        range: { min: 0, max: 1 },
        default: 0.5,
      },
      {
        name: "Highlights",
        type: "range",
        range: { min: 0, max: 1 },
        default: 0,
      },
      { name: "Shadows", type: "range", range: { min: 0, max: 1 }, default: 0 },
      { name: "Color Temp", type: "color", default: "#ffffff" },
      { name: "Amount", type: "range", range: { min: 0, max: 1 }, default: 0 },
    ])
  );
}
