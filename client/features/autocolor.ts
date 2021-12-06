import { ImageController } from "../components/image-controller";
import { ToolRegistrar } from "../components/tools";
import { toolHeader } from "../element-templates";
import { transform } from "../imageProcess/client";
import { isPicture } from "../../shared/lib/utils";

export function setupAutocolor(
  imageController: ImageController,
  toolRegistrar: ToolRegistrar
) {
  const name = "Autocolor";
  toolRegistrar.registerTool(name, {
    filterName: "autocolor",
    enable: (e) => isPicture(e),
    build: function () {
      return `${this.filterName}=1`;
    },
    icon: async function (context) {
      await transform(context, this.build());
      return true;
    },
    activate: async function () {
      imageController.addOperation(this.build());
      return true;
    },
    buildUI: function (index: number, args: string[]) {
      const e = toolHeader(name, index, imageController);
      return e.get()!;
    },
  });
}
