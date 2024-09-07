import { ImageController } from "../components/image-controller";
import { t } from "../components/strings";
import { PAGES, ToolRegistrar } from "../components/tools";

import { ToolEditor } from "../components/tool-editor";
import { ParametrizableTool } from "./baseTool";

export function setupSharpen(
  controller: ImageController,
  toolRegistrar: ToolRegistrar,
  editor: ToolEditor
) {
  toolRegistrar.registerTool(
    PAGES.CONTRAST,
    new ParametrizableTool("Sharpen", "sharpen", controller, editor, [
      {
        name: "Amount",
        type: "range",
        range: { min: 0, max: 200 },
        default: 100,
      },
    ])
  );
}
