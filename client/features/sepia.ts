import { ImageController } from "../components/image-controller.js";
import { ToolRegistrar } from "../components/tools.js";
import { toolHeader } from "../element-templates.js";
import { transform } from "../imageProcess/client.js";

export function setupSepia(
  imageController: ImageController,
  toolRegistrar: ToolRegistrar
) {
  const name = "Sepia";
  toolRegistrar.registerTool(name, {
    filterName: "sepia",
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
