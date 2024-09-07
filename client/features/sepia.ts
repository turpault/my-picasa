import { ImageController } from "../components/image-controller";
import { t } from "../components/strings";
import { ToolEditor } from "../components/tool-editor";
import { PAGES, ToolRegistrar } from "../components/tools";
import { FilterTool } from "./baseTool";

export function setupSepia(
  controller: ImageController,
  toolRegistrar: ToolRegistrar,
  editor: ToolEditor
) {
  toolRegistrar.registerTool(
    PAGES.BRUSH,
    new FilterTool("Sepia", "sepia", controller, editor)
  );
}
