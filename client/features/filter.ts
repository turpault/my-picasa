import { ImageController } from "../components/image-controller";
import { ToolRegistrar } from "../components/tools";
import { toolHeader } from "../element-templates";
import { transform } from "../imageProcess/client";
import { $ } from "../lib/dom";
import { isPicture } from "../../shared/lib/utils";
import { getService } from "../rpc/connect";

export function setupFilters(
  imageController: ImageController,
  toolRegistrar: ToolRegistrar
) {
  const name = `Filter`;
  const filterList: { [group: string]: string[] } = {};
  getService().then(async (s) => {
    const groups = (await s.getFilterGroups()) as string[];

    groups.forEach(async (group) => {
      filterList[group] = await s.getFilterList(group);
    });
    filterList['Mosaic'] = groups.map(g=>`All:${g}`);
  });
  toolRegistrar.registerTool(name, {
    filterName: `filter`,
    enable: (e) => isPicture(e),
    build: function (name: string) {
      return `${this.filterName}=1,${name}`;
    },
    icon: async function (context) {
      await transform(context, this.build(`any`));
      return true;
    },
    activate: async function (index: number, args?: string[]) {
      if (!args) {
        const selectedGroup = Object.keys(filterList)[0];
        imageController.addOperation(this.build(selectedGroup[0]));
      }
      return true;
    },
    buildUI: function (index: number, args: string[], context: string) {
      const e = toolHeader(name, index, imageController, toolRegistrar);
      const ctrl = $(`
        <div class="tool-control tool-filter">
          <select class="filter-groups">
          </select>
          <div class="filter-buttons">          
          </div>
        </div>
      `);
      e.append(ctrl);
      const groupCtl = $(".filter-groups", ctrl);
      const lst = $(".filter-buttons", ctrl);
      const selectedGroup =
        Object.keys(filterList).find((group) =>
          filterList[group].includes(args[1])
        ) || Object.keys(filterList)[0];

      Object.keys(filterList).forEach((group) => {
        groupCtl.append(
          `<option ${
            group === selectedGroup ? "selected" : ""
          } value="${group}">${group}</option>`
        );
      });

      const refreshList = (selectedGroup: string) => {
        lst.empty();
        for (const filter of filterList[selectedGroup].sort()) {
          const btn = $(
            `<button filter="${filter}" class="filter-apply-btn">${filter}</button>`
          );
          btn.on("click", () => {
            imageController.updateOperation(index, this.build(filter));
          });
          lst.append(btn);
          btn.addRemoveClass("filter-apply-btn-active", args[1] === filter);
        }

        getService().then(async (s) => {
          const copy = await s.cloneContext(context);
          await s.execute(copy, [
            ["resize", 200, 200, { fit: "cover", kernel: "nearest" }],
          ]);
          for (const filter of filterList[selectedGroup]) {
            const btn = $(`[filter="${filter}"]`, lst);
            const dup = await s.cloneContext(copy);
            await s.transform(dup, this.build(filter));
            const encoded = await s.encode(dup, "image/jpeg", "base64url");

            btn.css({
              "background-image": `url("${encoded.data}")`,
            });
            btn.attr("data-tooltip-below-image-contents", "test " + filter);
            btn.get().style.setProperty("--image", `url("${encoded.data}")`);

            await s.destroyContext(dup);
          }
          await s.destroyContext(copy);
        });
      };
      refreshList(selectedGroup);
      groupCtl.on("change", () => {
        refreshList(groupCtl.val());
      });
      return { ui: e.get()! };
    },
  });
}
