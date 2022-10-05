import { ImageController } from "../components/image-controller";
import { ToolRegistrar } from "../components/tools";
import { toolHeader } from "../element-templates";
import { transform } from "../imageProcess/client";
import { $ } from "../lib/dom";
import { isPicture } from "../../shared/lib/utils";
import { getService } from "../rpc/connect";

export function setupFilters(
  imageController: ImageController,
  toolRegistrar: ToolRegistrar,
  group: string
) {
  const name = `Filter: ${group}`;
  const filterList: string[] = [];
  getService().then(async s => {
    const filters = await s.getFilterList(group);
    filterList.push(...filters);
  })
  toolRegistrar.registerTool(name, {
    filterName: `filter:${group}`,
    enable: (e) => isPicture(e),
    build: function (
      name: string
    ) {
      return `${this.filterName
        }=1,${name}`;
    },
    icon: async function (context) {
      await transform(context, this.build(`any:${group}`));
      return true;
    },
    activate: async function (index: number, args?: string[]) {
      if (!args) {
        imageController.addOperation(this.build(`All:${group}`));
      }
      return true;
    },
    buildUI: function (index: number, args: string[]) {
      const e = toolHeader(name, index, imageController, toolRegistrar);
      e.append(`
      <div>
        <div class="tool-control tool-filter">
          <label>Filter</label>
          
          <select class="filter-list">
            ${['All', ...filterList.sort()].map(filter => `<option value="${filter}">${filter}</option>`).join('\n')}
          </select>
        </div>
      </div>`);
      const update = () => {
        const filter = $(".filter-list", e).val();
        imageController.updateOperation(
          index,
          this.build(filter)
        );
      };
      $(".filter-list", e).on("change", update).val(args[1]);
      return { ui: e.get()! };
    },
  });
}
