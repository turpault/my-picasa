import { isPicture } from "../../shared/lib/utils";
import { ImageController } from "../components/image-controller";
import { ToolRegistrar } from "../components/tools";
import { toolHeader } from "../element-templates";
import { transform } from "../imageProcess/client";
import { getService } from "../rpc/connect";

export function setupFilters(
  imageController: ImageController,
  toolRegistrar: ToolRegistrar
) {
  const name = `Filter`;
  getService().then(async (s) => {
    const groups = (await s.getFilterGroups()) as string[];

    groups.forEach(async (group) => {
      const filterList = await s.getFilterList(group);
      for (const filter of [...filterList]) {
        toolRegistrar.registerTool(filter, group, {
          multiple: false,
          filterName: `filter:${filter}`,
          enable: (e) => isPicture(e),
          build: function () {
            return `${this.filterName}=1,${name}`;
          },
          icon: async function (context) {
            await transform(context, this.build());
            return true;
          },
          activate: async function (index: number, args?: string[]) {
            if (!args) {
              imageController.addOperation(this.build());
            }
            return true;
          },
          buildUI: function (index: number, args: string[], context: string) {
            const e = toolHeader(`${name} : ${filter}`, index, imageController, toolRegistrar);
            return { ui: e.get()! };
          },
        });
      }
    });
  });
}
