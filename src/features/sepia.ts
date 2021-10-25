import { ImageController } from "../components/image-controller.js";
import { ToolRegistrar } from "../components/tools.js";
import { transform } from "../imageProcess/client.js";
import { jBone as $ } from "../lib/jbone/jbone.js";

export function setupSepia(
  imageController: ImageController,
  toolRegistrar: ToolRegistrar
) {
  toolRegistrar.registerTool("Sepia", {
    filterName: "sepia",
    build: function () {
      return `${this.filterName}=1`;
    },
    icon: async function (context) {
      // Crop at 50%
      await transform(context, this.build());
      return true;
    },
    activate: async function () {
      imageController.addOperation(this.build());
      return true;
    },
    buildUI: function (index: number, args: string[]) {
      const e = $(`<li class="w3-display-container">${name}
      <span class="w3-button w3-display-right">&times;</span>
    </li>`);
      $("span", e).on("click", () => {
        imageController.deleteOperation(index);
      });
      return e[0];
    },
  });
}
