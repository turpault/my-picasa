import { PicasaFilter } from "../../shared/lib/utils";
import { ImageController } from "../components/image-controller";
import { t } from "../components/strings";
import { ToolEditor } from "../components/tool-editor";
import { PAGES, ToolRegistrar } from "../components/tools";
import { FilterTool, ParametrizableTool } from "./baseTool";

export function setupBW(
  imageController: ImageController,
  toolRegistrar: ToolRegistrar,
  editor: ToolEditor
) {
  toolRegistrar.registerTool(
    PAGES.BRUSH,
    new ParametrizableTool("Greyscale", "bw", imageController, editor, [
      {
        name: "Amount",
        type: "range",
        range: { min: 0, max: 1 },
        default: 0.5,
      },
      { name: "v1", type: "range", range: { min: 0, max: 1 }, default: 0 },
      { name: "v2", type: "range", range: { min: 0, max: 1 }, default: 0 },
      { name: "Color", type: "color", default: "#ffffff" },
      {
        name: "Threshold",
        type: "range",
        range: { min: 0, max: 1 },
        default: 0,
      },
    ])
  );
}
