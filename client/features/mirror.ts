import { ImageController } from "../components/image-controller";
import { t } from "../components/strings";
import { ToolEditor } from "../components/tool-editor";
import { PAGES, ToolRegistrar } from "../components/tools";
import { FilterTool } from "./baseTool";

export function setupMirror(
  controller: ImageController,
  toolRegistrar: ToolRegistrar,
  editor: ToolEditor,
) {
  toolRegistrar.registerTool(
    PAGES.WRENCH,
    new FilterTool("Mirror", "mirror", controller, editor),
  );
}
