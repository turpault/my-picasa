import { toolHeader } from "../element-templates.js";
import {
  cloneContext,
  destroyContext,
  encode,
  execute,
} from "../imageProcess/client.js";
import { setImageDataToCanvasElement } from "../lib/dom.js";
import { jBone as $ } from "../lib/jbone/jbone.js";
import jimp from "../lib/jimp/jimp.js";
import { decodeOperation } from "../lib/utils.js";
import { Tool } from "../types/types.js";
import { ImageController } from "./image-controller.js";

async function toolIconForTool(
  context: string,
  tool: Tool
): Promise<ImageData> {
  const copy = await cloneContext(context);
  await tool.icon(copy);
  const data = (await encode(copy, "raw")) as ImageData;
  await destroyContext(copy);
  return data;
}

export class ToolRegistrar {
  constructor(toolListElement: HTMLElement) {
    this.tools = {};
    this.toolButtons = {};
    this.toolListElement = toolListElement;
  }
  private toolButtons: { [name: string]: HTMLCanvasElement };
  registerTool(toolName: string, tool: Tool) {
    this.tools[toolName] = tool;

    const t = $(
      `<div class="w3-button tool-button"><canvas></canvas><label>${toolName}</label></div>`
    );
    this.toolButtons[toolName] = $("canvas", t)[0];
    t.on("click", () => tool.activate());
    this.toolListElement.appendChild(t[0]!);
  }

  async refreshToolIcons(context: string) {
    // Initial copy, resized
    const copy = await cloneContext(context);
    await execute(copy, [
      ["background", jimp.cssColorToHex("#ffffff")],
      ["scaleToFit", 60, 60, jimp.RESIZE_NEAREST_NEIGHBOR],
    ]);
    for (const [toolName, tool] of Object.entries(this.tools)) {
      const data = await toolIconForTool(copy, tool);
      const target = this.toolButtons[toolName];
      setImageDataToCanvasElement(data, target);
      $(target).css({
        left: `${(75 - data.width) / 2}px`,
        top: `${(80 - data.height) / 2}px`,
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
      return e[0];
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
  const registrar = new ToolRegistrar($("#actions", e)[0]);

  const history = $("#history", e);
  const description = $("#description", e);
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
      if (ui) history[0].insertBefore(ui, history[0].firstChild);
    }
  });
  return registrar;
}
