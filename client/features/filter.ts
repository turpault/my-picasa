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
        imageController.addOperation(this.build(filterList[0]));
      }
      return true;
    },
    buildUI: function (index: number, args: string[], context: string) {
      const e = toolHeader(name, index, imageController, toolRegistrar);
      const ctrl = $(`
        <div class="tool-control tool-filter">
          <label>Filter</label>
          <div class="filter-buttons">
          </div>
        </div>
      `);
      e.append(ctrl);
      const lst = $('.filter-buttons', ctrl);

      for (const filter of filterList.sort()) {
        const btn = $(`<button filter="${filter}" class="filter-apply-btn">${filter}</button>`);
        btn.on('click', () => {
          imageController.updateOperation(
            index,
            this.build(filter)
          );
        });
        lst.append(btn);
        btn.addRemoveClass('filter-apply-btn-active', args[1] === filter);
      }

      getService().then(async s => {
        const copy = await s.cloneContext(context);
        await s.execute(copy, [
          ["resize", 200, 200, { fit: "cover", kernel: "nearest" }],
        ]);
        for (const filter of filterList.sort()) {
          const btn = $(`[filter="${filter}"]`, lst);
          const dup = await s.cloneContext(copy);
          await s.transform(dup, this.build(filter));
          const encoded = await s.encode(dup, 'image/jpeg', 'base64url');

          btn.css({
            "background-image": `url("${encoded.data}")`,
          });
          btn.attr('data-tooltip-below-image-contents', "test " + filter);
          btn.get().style.setProperty('--image', `url("${encoded.data}")`);

          await s.destroyContext(dup);
        }
        await s.destroyContext(copy);
      });

      return { ui: e.get()! };
    },
  });
}
