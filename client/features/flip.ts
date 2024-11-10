import { ImageController } from "../components/image-controller";
import { ToolEditor } from "../components/tool-editor";
import { PAGES, ToolRegistrar } from "../components/tools";
import { FilterTool } from "./baseTool";

export function setupFlip(
  controller: ImageController,
  toolRegistrar: ToolRegistrar,
  editor: ToolEditor,
) {
  toolRegistrar.registerTool(
    PAGES.WRENCH,
    new FilterTool("Flip", "flip", controller, editor),
  );
}
