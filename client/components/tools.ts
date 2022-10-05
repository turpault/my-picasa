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

async function toolIconForTool(context: string, tool: Tool): Promise<string> {
  const copy = await cloneContext(context);
  await tool.icon(copy);
  const res = await encode(copy, "image/jpeg", "base64url");
  await destroyContext(copy);
  return res.data as string;
}

type ToolRegistrarEvents = {
  added: { tool: Tool };
  activate: { index: number; tool: Tool };
};

export class ToolRegistrar {
  constructor(toolListElement: _$) {
    this.tools = {};
    this.toolButtons = {};
    this.toolListElement = toolListElement;
    this.events = buildEmitter<ToolRegistrarEvents>();
  }
  events: Emitter<ToolRegistrarEvents>;
  private toolButtons: { [name: string]: any };
  registerTool(toolName: string, tool: Tool) {
    this.tools[toolName] = tool;

    const elem = $(
      `<div class="w3-button tool-button"><label>${t(toolName)}</label></div>`
    );
    this.toolButtons[toolName] = elem;
    elem.on("click", () => this.events.emit("added", { tool }));
    this.toolListElement.append(elem);
  }

  async refreshToolIcons(context: string, entry: AlbumEntry) {
    // Initial copy, resized
    const copy = await cloneContext(context);
    await execute(copy, [
      ["resize", 60, 60, { fit: "cover", kernel: "nearest" }],
    ]);
    await commit(copy);
    await Promise.allSettled(
      Object.entries(this.tools).map(async ([toolName, tool]) => {
        const data = await toolIconForTool(copy, tool);
        const target = this.toolButtons[toolName];
        target.css({
          "background-image": `url(${data})`,
          display: tool.enable(entry) ? "" : "none",
        });
      })
    );
    destroyContext(copy);
  }

  makeUiForTool(
    filterName: string,
    index: number,
    args: string[],
    ctrl: ImageController
  ): { ui: HTMLElement; clearFct?: Function } {
    const tool = Object.values(this.tools).filter(
      (t) => t.filterName === filterName
    )[0];
    if (!tool) {
      const e = toolHeader(filterName, index, ctrl, this);
      return { ui: e.get()! };
    }
    return tool.buildUI(index, args);
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
}

export function make(e: _$, ctrl: ImageController): ToolRegistrar {
  const registrar = new ToolRegistrar($(".effects", e));

  const history = $(".history", e);
  const description = $(".description", e);
  description.on("input", () => {
    ctrl.updateCaption(description.val());
  });

  ctrl.events.on("liveViewUpdated", ({ context, entry }) => {
    // Refresh the icons
    registrar.refreshToolIcons(context, entry);
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
      const toolUi = registrar.makeUiForTool(name, toolCount++, args, ctrl);
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
