import { decodeOperation, PicasaFilter, sleep } from "../../shared/lib/utils";
import { AlbumEntry } from "../../shared/types/types";
import { toolHeader } from "../element-templates";
import {
  cloneContext,
  commit,
  destroyContext,
  encode,
  execute,
} from "../imageProcess/client";
import { $, _$ } from "../lib/dom";
import { buildEmitter, Emitter } from "../../shared/lib/event";
import { Tool } from "../uiTypes";
import { ImageController } from "./image-controller";
import { t } from "./strings";

export const GENERAL_TOOL_TAB = "General";
async function toolIconForTool(
  context: string,
  original: string,
  tool: Tool
): Promise<string> {
  const copy = await cloneContext(context, "tool " + tool.filterName);
  await tool.icon(copy, original);
  const res = await encode(copy, "image/jpeg", "base64url");
  await destroyContext(copy);
  return res.data as string;
}

type ToolRegistrarEvents = {
  added: { tool: Tool };
  activate: { index: number; tool: Tool };
  preview: { operation: PicasaFilter | null };
};

export class ToolRegistrar {
  private pages: { [pageName: string]: string[] } = {};
  private currentPage: string = "";
  private buttonList: _$;
  private groupList: _$;
  private toolButtons: { [name: string]: any };
  private activeEntry: AlbumEntry | undefined;
  constructor(toolListElement: _$) {
    this.tools = {};
    this.toolButtons = {};
    this.toolListElement = toolListElement;
    this.events = buildEmitter<ToolRegistrarEvents>(false);
    const ctrl = $(`
    <div class="tool-control tool-filter">
      <select class="filter-groups">
      </select>
      <div class="filter-buttons">          
      </div>
    </div>
  `);
    this.toolListElement.append(ctrl);
    this.buttonList = $(".filter-buttons", ctrl);
    this.groupList = $(".filter-groups", ctrl);
    this.groupList.on("change", () => {
      this.currentPage = this.groupList.val();
      this.refreshButtons();
    });
  }
  events: Emitter<ToolRegistrarEvents>;
  registerTool(toolName: string, page: string, tool: Tool) {
    this.tools[toolName] = tool;
    const newPage = !this.pages[page];
    if (newPage) {
      this.pages[page] = [toolName];
    } else {
      this.pages[page].push(toolName);
    }
    const elem = $(
      `<div class="w3-button tool-button"><label>${toolName}</label></div>`
    );
    this.toolButtons[toolName] = elem;
    elem.on("click", () => {
      this.events.emit("added", { tool: this.tools[toolName] });
    });
    elem.on("mouseenter", () => {
      if (this.tools[toolName].preview) {
        this.events.emit("preview", {
          operation: this.tools[toolName].build(),
        });
      }
    });
    elem.on("mouseleave", () => {
      this.events.emit("preview", { operation: null });
    });

    if (newPage) {
      // Refresh tool list
      this.refreshToolPages();
    }
  }

  private refreshToolPages() {
    //this.toolListHeader.empty();

    this.groupList.empty();
    Object.keys(this.pages).forEach((page) => {
      this.groupList.append(
        `<option ${
          page === this.currentPage ? "selected" : ""
        } value="${page}">${page}</option>`
      );
    });
  }

  getPages() {
    return this.pages;
  }

  selectPage(page: string = GENERAL_TOOL_TAB) {
    this.currentPage = page;
    this.refreshButtons();
  }

  private refreshButtons() {
    this.buttonList.empty();
    for (const toolName of this.pages[this.currentPage]) {
      this.buttonList.append(this.toolButtons[toolName]);
    }
  }

  async refreshToolIcons(context: string, original: string, entry: AlbumEntry) {
    this.activeEntry = entry;
    // Initial copy, resized
    const copy = await cloneContext(context, "toolminiicon");
    await execute(copy, [
      ["resize", 60, 60, { fit: "cover", kernel: "nearest" }],
    ]);
    await commit(copy);

    // First get the active tab tools
    const page = this.currentPage;
    await Promise.allSettled(
      Object.entries(this.tools)
        .filter(([name]) => this.pages[page].includes(name))
        .map(async ([name, tool]) => {
          const data = await toolIconForTool(copy, original, tool);
          const target = this.toolButtons[name];
          target.css({
            "background-image": `url(${data})`,
            display: tool.enable(entry) ? "" : "none",
          });
        })
    );

    // Wait until the other tool icons are built
    sleep(1).then(async () => {
      for (const [name, tool] of Object.entries(this.tools)) {
        if (!this.activeEntry || this.activeEntry.name !== entry.name) {
          // No need to continue, as the active image changed
          continue;
        }
        if (!this.pages[page].includes(name)) {
          const data = await toolIconForTool(copy, original, tool);
          const target = this.toolButtons[name];
          target.css({
            "background-image": `url(${data})`,
            display: tool.enable(entry) ? "" : "none",
          });
        }
      }
      destroyContext(copy);
    });
  }

  toolNameForFilter(filter: string): string | null {
    const res = Object.entries(this.tools).find(
      ([_name, tool]) => tool.filterName === filter
    );
    if (res) {
      return res[0];
    }
    return null;
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
      const e = toolHeader(filterName, index, ctrl, this);
      return { ui: e.get()! };
    }
    return tool.buildUI(index, args, context);
  }

  tool(name: string): Tool | undefined {
    return Object.values(this.tools).find((t) => t.filterName === name);
  }

  edit(index: number, name: string) {
    this.events.emit("activate", { index, tool: this.tools[name] });
  }

  private tools: {
    [name: string]: Tool;
  };
  private toolListElement: _$;
}

export function make(e: _$, ctrl: ImageController): ToolRegistrar {
  const title = $(".effects-title", e);
  const registrar = new ToolRegistrar($(".effects", e));

  const history = $(".history", e);
  const description = $(".description", e);
  description.on("input", () => {
    ctrl.updateCaption(description.val());
  });

  ctrl.events.on("liveViewUpdated", ({ context, original, entry }) => {
    // Refresh the icons
    registrar.refreshToolIcons(context, original, entry);
  });
  const clearList: (Function | undefined)[] = [];
  ctrl.events.on("updated", ({ context, caption, filters }) => {
    description.val(caption || "");
    // Update the operation list
    while (clearList.length > 0) {
      const fct = clearList.pop();
      if (fct) fct();
    }
    title.empty();
    if (filters.length > 0) {
      title.append(
        $(
          `<button class='undo-last-operation'>${
            t("Cancel") +
            " " +
            registrar.toolNameForFilter(filters.slice(-1)[0].name)
          }</button>`
        ).on("click", (e) => {
          ctrl.deleteOperation(filters.length - 1);
          e.stopPropagation();
        })
      );
    }
    const newControls = $("<div/>");
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
      if (toolUi.ui)
        newControls.get().insertBefore(toolUi.ui, newControls.get().firstChild);
    }
    if (newControls.innerHTML() !== history.innerHTML()) {
      history.empty();
      for (const c of newControls.children()) {
        c.remove();
        history.append(c);
      }
    }
  });
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
      ctrl.muteAt(toolCount);
      const commited = await tool.activate(toolCount);
      ctrl.muteAt(-1);
      if (!commited) {
        ctrl.deleteOperation(toolCount);
      }
    } else {
      tool.activate(toolCount);
    }
  });
  registrar.events.on("activate", async ({ index, tool }) => {
    ctrl.muteAt(index);
    await tool.activate(index, ctrl.operationList()[index].args);
    ctrl.muteAt(-1);
  });
  return registrar;
}
