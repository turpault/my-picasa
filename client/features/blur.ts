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
      "Blur",
      "blur",
      controller,
      editor,
      [
        {
          name: "Effect",
          type: "range",
          range: { min: 0.3, max: 100 },
          default: 0.5,
        },
      ],
      undefined,
      t("Apply a blur with a specific radius")
    )
  );
}
