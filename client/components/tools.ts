import { decodeOperation } from "../../shared/lib/utils";
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

export const GENERAL_TOOL_TAB = 'General';
async function toolIconForTool(context: string, original: string, tool: Tool): Promise<string> {
  const copy = await cloneContext(context);
  await tool.icon(copy, original);
  const res = await encode(copy, "image/jpeg", "base64url");
  await destroyContext(copy);
  return res.data as string;
}

type ToolRegistrarEvents = {
  added: { tool: Tool };
  activate: { index: number; tool: Tool };
};

export class ToolRegistrar {
  private pages: { [pageName: string]: string[] } = {};
  private currentPage: string = '';
  private buttonList: _$;
  private groupList: _$;
  private toolButtons: { [name: string]: any };
  constructor(toolListElement: _$, toolHeader: _$) {
    this.tools = {};
    this.toolButtons = {};
    this.toolListElement = toolListElement;
    this.toolListHeader = toolHeader;
    this.events = buildEmitter<ToolRegistrarEvents>();
    const ctrl = $(`
    <div class="tool-control tool-filter">
      <select class="filter-groups">
      </select>
      <div class="filter-buttons">          
      </div>
    </div>
  `);
    this.toolListElement.append(ctrl);
    this.buttonList = $('.filter-buttons', ctrl);
    this.groupList = $(".filter-groups", ctrl);
    this.groupList.on('change', () => {
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
      `<div class="w3-button tool-button"><label>${t(toolName)}</label></div>`
    );
    this.toolButtons[toolName] = elem;
    elem.on("click", () => {
      this.events.emit("added", { tool: this.tools[toolName] });
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
        `<option ${page === this.currentPage ? "selected" : ""
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
    // Initial copy, resized
    const copy = await cloneContext(context);
    await execute(copy, [
      ["resize", 60, 60, { fit: "cover", kernel: "nearest" }],
    ]);
    await commit(copy);


    await Promise.allSettled(
      Object.entries(this.tools).map(async ([name, tool]) => {
        const data = await toolIconForTool(copy, original, tool);
        const target = this.toolButtons[name];
        target.css({
          "background-image": `url(${data})`,
          display: tool.enable(entry) ? "" : "none",
        });
      })
    );
    console.info('Destroy copy', copy);
    destroyContext(copy);
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

  tool(name: string): Tool {
    return this.tools[name];
  }

  edit(index: number, name: string) {
    this.events.emit("activate", { index, tool: this.tools[name] });
  }

  private tools: {
    [name: string]: Tool;
  };
  private toolListElement: _$;
  private toolListHeader: _$;
}

export function make(e: _$, ctrl: ImageController): ToolRegistrar {
  const registrar = new ToolRegistrar($(".effects", e), $(".effects-title", e));

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
    const newControls = $('<div/>');
    const activeTools = ctrl.operationList().map(decodeOperation);
    let toolCount = 0;
    for (const { name, args } of activeTools) {
      const toolUi = registrar.makeUiForTool(name, toolCount++, args, ctrl, context);
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
  registrar.events.on("added", async ({ tool }) => {
    const activeTools = ctrl.operationList().map(decodeOperation);
    if (!tool.multiple) {
      // Go through the current list, and find if this tool was already applied
      const activeTools = ctrl.operationList().map(decodeOperation);
      const found = activeTools.findIndex(t => t.name === tool.filterName);
      if (found !== -1) {
        tool.activate(found, activeTools[found].args);
        return;
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
    await tool.activate(
      index,
      decodeOperation(ctrl.operationList()[index]).args
    );
    ctrl.muteAt(-1);
  });
  return registrar;
}
