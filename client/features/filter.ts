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
          multipleFamily: name,
          filterName: `filter:${filter}`,
          enable: (e) => isPicture(e),
          preview: true,
          build: function () {
            return {name: this.filterName, args:['1', name]};
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
          buildUI: function (index: number, args: string[], context: string) {
            const e = toolHeader(`${name} : ${filter}`, index, imageController, toolRegistrar);
            return { ui: e.get()! };
          },
        });
      }
    });
  });
}
