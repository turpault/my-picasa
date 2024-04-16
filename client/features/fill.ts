import { ImageController } from "../components/image-controller";
import { t } from "../components/strings";
import { PAGES, ToolRegistrar } from "../components/tools";

import { ToolEditor } from "../components/tool-editor";
import { ParametrizableTool } from "./baseTool";

export function setupFill(
  controller: ImageController,
  toolRegistrar: ToolRegistrar,
  editor: ToolEditor
) {
  toolRegistrar.registerTool(
    PAGES.CONTRAST,
    new ParametrizableTool(t("Extra Light"), "fill", controller, editor, [
      {
        name: "Amount",
        type: "range",
        range: { min: -1, max: 1 },
        default: 0.1,
      },
    ])
  );
}
