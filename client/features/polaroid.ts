import { ImageController } from "../components/image-controller";
import { t } from "../components/strings";
import { PAGES, ToolRegistrar } from "../components/tools";

import { ToolEditor } from "../components/tool-editor";
import { ParametrizableTool } from "./baseTool";

export function setupPolaroid(
  controller: ImageController,
  toolRegistrar: ToolRegistrar,
  editor: ToolEditor
) {
  toolRegistrar.registerTool(
    PAGES.CONTRAST,
    new ParametrizableTool(t("Polaroid"), "Polaroid", controller, editor, [
      {
        name: "Angle",
        type: "range",
        range: { min: -10, max: 10 },
        default: 10,
      },
      { name: "Background Colour", type: "color", default: "#ffffff" },
      { name: "Text", type: "text", default: "preview" },
    ])
  );
}
