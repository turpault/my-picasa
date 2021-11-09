import { decodeOperation } from "../../shared/lib/utils.js";
import { Tool } from "../../shared/types/types.js";
import { toolHeader } from "../element-templates.js";
import {
  cloneContext,
  commit,
  destroyContext,
  encode,
  execute,
} from "../imageProcess/client.js";
import { __ } from "../lib/dom.js";
import { ImageController } from "./image-controller.js";

async function toolIconForTool(context: string, tool: Tool): Promise<string> {
  const copy = await cloneContext(context);
  await tool.icon(copy);
  const data = await encode(copy, "image/jpeg", "base64url");
  await destroyContext(copy);
  return data;
}

export class ToolRegistrar {
  constructor(toolListElement: HTMLElement) {
    this.tools = {};
    this.toolButtons = {};
    this.toolListElement = toolListElement;
  }
  private toolButtons: { [name: string]: any };
  registerTool(toolName: string, tool: Tool) {
    this.tools[toolName] = tool;

    const t = __(
      `<div class="w3-button tool-button"><label>${toolName}</label></div>`
    );
    this.toolButtons[toolName] = t;
    t.on("click", () => tool.activate());
    this.toolListElement.appendChild(t.get());
  }

  async refreshToolIcons(context: string) {
    // Initial copy, resized
    const copy = await cloneContext(context);
    await execute(copy, [
      ["resize", 60, 60, { fit: "cover", kernel: "nearest" }],
    ]);
    await commit(copy);
    for (const [toolName, tool] of Object.entries(this.tools)) {
      const data = await toolIconForTool(copy, tool);
      const target = this.toolButtons[toolName];
      target.css({
        "background-image": `url(${data})`,
      });
    }
    destroyContext(copy);
  }

  makeUiForTool(
    filterName: string,
    index: number,
    args: string[],
    ctrl: ImageController
  ): HTMLElement {
    const tool = Object.values(this.tools).filter(
      (t) => t.filterName === filterName
    )[0];
    if (!tool) {
      const e = toolHeader(filterName, index, ctrl);
      return e.get()!;
    }
    return tool.buildUI(index, args);
  }

  tool(name: string): Tool {
    return this.tools[name];
  }

  private tools: {
    [name: string]: Tool;
  };
  private toolListElement: HTMLElement;
}

export function make(e: HTMLElement, ctrl: ImageController): ToolRegistrar {
  const registrar = new ToolRegistrar(__(".actions", e).get());

  const history = __(".history", e);
  const description = __(".description", e);
  description.on("input", () => {
    ctrl.updateCaption(description.val());
  });

  ctrl.events.on("liveViewUpdated", ({ context }) => {
    // Refresh the icons
    registrar.refreshToolIcons(context);
  });
  ctrl.events.on("updated", ({ context, meta }) => {
    description.val(meta.caption || "");
    // Update the operation list
    history.empty();

    for (const [index, { name, args }] of ctrl
      .operationList()
      .map(decodeOperation)
      .entries()) {
      const ui = registrar.makeUiForTool(name, index, args, ctrl);
      if (ui) history.get().insertBefore(ui, history.get().firstChild);
    }
  });
  return registrar;
}
