import { PicasaFilter } from "../../shared/lib/utils";
import { AlbumEntry } from "../../shared/types/types";
import { Tool } from "../features/baseTool";
import {
  cloneContext,
  commit,
  destroyContext,
  resizeContext,
} from "../imageProcess/client";
import { $, _$ } from "../lib/dom";
import { awaiters, lock } from "../../shared/lib/mutex";
import { ImageController } from "./image-controller";

export enum PAGES {
  WRENCH = "wrench",
  CONTRAST = "contrast",
  BRUSH = "brush",
  GREEN_BRUSH = "greenBrush",
  BLUE_BRUSH = "blueBrush",
}
export class ToolRegistrar {
  private activeEntry: AlbumEntry | undefined;
  constructor(private editor: _$, private pages: { [key in PAGES]: _$ }) {
    this.tools = {};
  }
  registerTool(page: PAGES, tool: Tool) {
    if (!this.pages[page]) {
      throw `Unknown page ${page}`;
    }

    const elem = tool.ui()!;
    this.pages[page].append(elem);
    this.tools[tool.displayName] = { tool, component: elem };
  }

  // Refresh icons from the updated context. Can be reentered
  async updateToolUIs(
    context: string,
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
        if (awaiters("updateToolUIs") > 1) {
          break;
        }
        if (tool.tool.update) {
          await tool.tool.update(filters, context);
        }
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
      ?.tool;
  }

  private tools: {
    [name: string]: { tool: Tool; component: _$ };
  };
}

export function makeTools(
  editor: _$,
  components: { [key in PAGES]: _$ },
  ctrl: ImageController
): ToolRegistrar {
  const title = $(".effects-title", editor);
  const registrar = new ToolRegistrar(editor, components /*$(".effects", e)*/);

  //const history = $(".history", editor);
  //const adjustmentHistory = $(".adjustment-history", editor);
  /*const description = $(".description", e);
  description.on("input", () => {
    ctrl.updateCaption(description.val());
  });*/

  ctrl.events.on("updated", async ({ caption, filters, entry }) => {
    const thumbContext = await ctrl.getLiveThumbnailContext();
    registrar.updateToolUIs(thumbContext, entry, filters);
  });
  return registrar;
}
