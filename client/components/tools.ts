import { buildEmitter, Emitter } from "../../shared/lib/event";
import { awaiters, lock, PicasaFilter, sleep } from "../../shared/lib/utils";
import { AlbumEntry } from "../../shared/types/types";
import { toolHeader } from "../element-templates";
import { Tool } from "../features/baseTool";
import {
  cloneContext,
  commit,
  destroyContext,
  encode,
  resizeContext,
} from "../imageProcess/client";
import { $, _$ } from "../lib/dom";
import { ImageController } from "./image-controller";
import { t } from "./strings";

export const GENERAL_TOOL_TAB = "General";

export class ToolRegistrar {
  private activeEntry: AlbumEntry | undefined;
  constructor(components: {
    editor: _$;
    wrench: _$;
    contrast: _$;
    brush: _$;
    greenBrush: _$;
    blueBrush: _$;
  }) {
    this.tools = {};
    this.pages = components;
  }
  registerTool(page: string, tool: Tool) {
    if (!this.pages[page]) {
      throw `Unknown page ${page}`;
    }

    const elem = tool.ui()!;
    this.pages[page].append(elem);
    this.tools[tool.name] = { tool, component: elem };
  }

  // Refresh icons from the updated context. Can be reentered
  async updateToolUIs(
    context: string,
    original: string,
    entry: AlbumEntry,
    filters: PicasaFilter[]
  ) {
    this.activeEntry = entry;

    const l = await lock("updateToolUIs");
    // Initial copy, resized
    try {
      const copy = await cloneContext(context, "toolminiicon");
      await resizeContext(copy, 60);
      await commit(copy);

      for (const [name, tool] of Object.entries(this.tools)) {
        if (awaiters("updateToolUIs") > 0) {
          break;
        }
        tool.tool.update(filters, copy);
      }
      destroyContext(copy);
    } finally {
      l();
    }
  }

  /*toolNameForFilter(filter: string): string | null {
    const res = Object.entries(this.tools).find(
      ([_name, tool]) => tool.filterName === filter
    );
    if (res) {
      return res[0];
    }
    return null;
  }
  ensurePermanentTools(
    originalOperations: PicasaFilter[]
  ): PicasaFilter[] | undefined {
    const operations = [...originalOperations];

    let needsUpdate = false;
    let updated = false;
    for (const [name, tool] of Object.entries(this.tools)) {
      if (tool.permanentIndex) {
        const index = operations.length - tool.permanentIndex;
        if (operations[index]) {
          if (operations[index].name !== tool.filterName) {
            needsUpdate = true;
            break;
          }
        }
      }
    }
    if (needsUpdate) {
      const newOps: PicasaFilter[] = [];
      for (const [name, tool] of Object.entries(this.tools)) {
        if (tool.permanentIndex === undefined) continue;
        const oldIndex = operations.findIndex(
          (o) => o.name === tool.filterName
        );
        if (oldIndex !== -1) {
          newOps[tool.permanentIndex] = operations[oldIndex];
          operations.splice(oldIndex, 1);
        } else {
          newOps[tool.permanentIndex] = tool.build();
        }
      }
      operations.push(...newOps.reverse().filter((v) => v));
      updated = true;
    }
    if (updated) {
      return operations;
    }
    return undefined;
  }
  makeUiForTool(
    filterName: string,
    index: number,
    args: string[],
    ctrl: ImageController,
    context: string
  ): { ui: HTMLElement; clearFct?: Function } {
    const tool = Object.values(this.tools).filter(
      (t) => t.filterName === filterName
    )[0];
    if (!tool) {
      const e = toolHeader(filterName, index, ctrl, this, tool);
      return { ui: e.get()! };
    }
    return tool.buildUI(index, args, context);
  }*/

  tool(name: string): Tool | undefined {
    return Object.values(this.tools).find((t) => t.tool.filterName === name)
      .tool;
  }

  private tools: {
    [name: string]: { tool: Tool; component: _$ };
  };
  private pages: { [name: string]: _$ };
}

export function makeTools(
  components: {
    editor: _$;
    wrench: _$;
    contrast: _$;
    brush: _$;
    greenBrush: _$;
    blueBrush: _$;
  },
  ctrl: ImageController
): ToolRegistrar {
  const title = $(".effects-title", components.editor);
  const registrar = new ToolRegistrar(components /*$(".effects", e)*/);

  //const history = $(".history", editor);
  //const adjustmentHistory = $(".adjustment-history", editor);
  /*const description = $(".description", e);
  description.on("input", () => {
    ctrl.updateCaption(description.val());
  });*/

  const clearList: (Function | undefined)[] = [];
  ctrl.filterSetup((operations: PicasaFilter[]) =>
    registrar.ensurePermanentTools(operations)
  );
  ctrl.events.on(
    "updated",
    ({ context, caption, filters, entry, liveContext }) => {
      registrar.updateToolUIs(liveContext, context, entry, filters);
      //description.val(caption || "");
      // Update the operation list
      while (clearList.length > 0) {
        const fct = clearList.pop();
        if (fct) fct();
      }
      title.empty();
      const lastFilterIndex = [...filters]
        .reverse()
        .findIndex((f) => registrar.tool(f.name)?.permanentIndex === undefined);
      if (lastFilterIndex !== -1) {
        title.append(
          $(
            `<button class='undo-last-operation'>${
              t("Cancel") +
              " " +
              registrar.toolNameForFilter(filters[lastFilterIndex].name)
            }</button>`
          ).on("click", (e) => {
            ctrl.deleteOperation(lastFilterIndex);
            e.stopPropagation();
          })
        );
      }
      const newControls = $("<div/>");
      const newAdjustmentHistory = $(`<div/>`);
      const activeTools = filters;
      let toolCount = 0;
      for (const { name: name, args } of activeTools) {
        const toolUi = registrar.makeUiForTool(
          name,
          toolCount++,
          args,
          ctrl,
          context
        );
        clearList.push(toolUi.clearFct);
        if (toolUi.ui) {
          toolUi.ui.classList.add("multiple");
          if (registrar.tool(name)?.permanentIndex) {
            newAdjustmentHistory.append(toolUi.ui);
          } else {
            newControls
              .get()
              .insertBefore(toolUi.ui, newControls.get().firstChild);
          }
        }
      }
      if (newControls.innerHTML() !== history.innerHTML()) {
        history.empty();
        for (const c of newControls.children()) {
          c.remove();
          history.append(c);
        }
      }
      adjustmentHistory.empty();
      for (const c of newAdjustmentHistory.children()) {
        c.remove();
        adjustmentHistory.append(c);
      }
    }
  );
  registrar.events.on("preview", async ({ operation }) => {
    ctrl.preview(operation);
  });
  registrar.events.on("added", async ({ tool }) => {
    const activeTools = ctrl.operationList();
    if (!tool.multipleFamily) {
      // Go through the current list, and find if this tool was already applied
      const activeTools = ctrl.operationList();
      const found = activeTools.findIndex(
        (t) => registrar.tool(t.name)?.multipleFamily === tool.multipleFamily
      );
      if (found !== -1) {
        if (activeTools[found].name === tool.filterName) {
          // Actually the same filter, replace its args
          tool.activate(found, activeTools[found].args);
          return;
        } else {
          ctrl.deleteOperation(found);
        }
      }
    }
    const toolCount = activeTools.length;
    if (tool.editable) {
      await ctrl.muteAt(toolCount);
      const commited = await tool.activate(toolCount);
      await ctrl.unmute();
      if (!commited) {
        ctrl.deleteOperation(toolCount);
      }
    } else {
      tool.activate(toolCount);
    }
  });
  registrar.events.on("activate", async ({ index, tool }) => {
    ctrl.muteAt(index);
    ctrl.events.once("visible", async () => {
      await tool.activate(index, ctrl.operationList()[index].args);
      await ctrl.unmute();
    });
  });
  return registrar;
}
