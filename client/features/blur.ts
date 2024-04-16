import { ImageController } from "../components/image-controller";
import { t } from "../components/strings";
import { ToolEditor } from "../components/tool-editor";
import { PAGES, ToolRegistrar } from "../components/tools";
import { FilterTool, ParametrizableTool } from "./baseTool";

export function setupBlur(
  controller: ImageController,
  toolRegistrar: ToolRegistrar,
  editor: ToolEditor
) {
  toolRegistrar.registerTool(
    PAGES.BRUSH,
    new ParametrizableTool(
      t("Blur"),
      "blur",
      controller,
      editor,
      [
        {
          name: "Radius",
          type: "range",
          range: { min: 1, max: 1000 },
          default: 10,
        },
      ],
      undefined,
      t("Apply a blur with a specific radius")
    )
  );
}
