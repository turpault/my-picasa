import { ImageController } from "../components/image-controller";
import { GENERAL_TOOL_TAB, ToolRegistrar } from "../components/tools";
import { toolHeader } from "../element-templates";
import { transform } from "../imageProcess/client";
import { isPicture } from "../../shared/lib/utils";
import { t } from "../components/strings";

export function setupMirror(
  imageController: ImageController,
  toolRegistrar: ToolRegistrar
) {
  const name = t("Mirror");
  toolRegistrar.registerTool(name, GENERAL_TOOL_TAB, {
    multipleFamily: name,
    filterName: "mirror",
    enable: (e) => isPicture(e),
    build: function () {
      return {
        name: this.filterName,
        args: ["1"],
      };
    },
    icon: async function (context) {
      await transform(context, [this.build()]);
      return true;
    },
    activate: async function (index: number, args?: string[]) {
      if (!args) {
        imageController.addOperation(this.build());
      }
      return true;
    },
    buildUI: function (index: number, args: string[]) {
      const e = toolHeader(name, index, imageController, toolRegistrar, this);
      return { ui: e.get()! };
    },
  });
}
