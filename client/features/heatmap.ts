import { ImageController } from "../components/image-controller";
import { t } from "../components/strings";
import { PAGES, ToolRegistrar } from "../components/tools";

import { ToolEditor } from "../components/tool-editor";
import { ParametrizableTool } from "./baseTool";

export function setupHeatmap(
  controller: ImageController,
  toolRegistrar: ToolRegistrar,
  editor: ToolEditor
) {
  toolRegistrar.registerTool(
    PAGES.CONTRAST,
    new ParametrizableTool(t("Heatmap"), "heatmap", controller, editor, [])
  );
}
