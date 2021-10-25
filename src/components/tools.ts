import { picture } from "../element-templates.js";
import {
  cloneContext,
  destroyContext,
  encode,
  execute,
  transform,
} from "../imageProcess/client.js";
import { setImageDataToCanvasElement } from "../lib/dom.js";
import { dragElement } from "../lib/draggable.js";
import { jBone as $ } from "../lib/jbone/jbone.js";
import jimp from "../lib/jimp/jimp.js";
import { decodeOperation, decodeOperations, encodeRect } from "../lib/utils.js";
import { ImageControllerEvent, Tool } from "../types/types.js";
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
      `<div class="w3-button tool-button"><canvas></canvas>${toolName}</div>`
    );
    this.toolButtons[toolName] = $("canvas", t)[0];
    t.on("click", () => tool.activate());
    this.toolListElement.appendChild(t[0]!);
  }

  async refreshTools(context: string) {
    // Initial copy, resized
    const copy = await cloneContext(context);
    await execute(copy, [["scaleToFit", 50, 50, jimp.RESIZE_NEAREST_NEIGHBOR]]);
    for (const [toolName, tool] of Object.entries(this.tools)) {
      const data = await toolIconForTool(copy, tool);
      const target = this.toolButtons[toolName];
      setImageDataToCanvasElement(data, target);
    }
  }

  makeUiForTool(
    filterName: string,
    index: number,
    args: string[]
  ): HTMLElement {
    const tool = Object.values(this.tools).filter(
      (t) => t.filterName === filterName
    )[0];
    if (!tool) {
      return $(`<div> ${filterName}<div>`);
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
  ctrl.events.on("updated", ({ context, operations }) => {
    // Refresh the icons
    registrar.refreshTools(context);

    description.val("Test");
    // Update the operation list
    history.empty();

    for (const [index, { name, args }] of operations
      .map(decodeOperation)
      .entries()) {
      history[0].insertBefore(
        registrar.makeUiForTool(name, index, args),
        history[0].firstChild
      );
    }
  });
  return registrar;
}
