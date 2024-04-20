import { ImageController } from "../components/image-controller";
import { t } from "../components/strings";
import { PAGES, ToolRegistrar } from "../components/tools";

import { ToolEditor } from "../components/tool-editor";
import { ParametrizableTool } from "./baseTool";

export function setupSolarize(
  controller: ImageController,
  toolRegistrar: ToolRegistrar,
  editor: ToolEditor
) {
  toolRegistrar.registerTool(
    PAGES.CONTRAST,
    new ParametrizableTool(t("Solarize"), "solarize", controller, editor, [
      {
        name: "Threshold",
        type: "range",
        range: { min: 0, max: 1 },
        default: 0.5,
      },
    ])
  );
}
