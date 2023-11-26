import { ImageController } from "../components/image-controller";
import {
  cloneContext,
  destroyContext,
  transform,
  encode,
} from "../imageProcess/client";
import { $, _$ } from "../lib/dom";
import { Emitter } from "../lib/event";
import { PicasaFilter } from "../lib/utils";
import { AlbumEntry } from "../types/types";

export type ToolRegistrarEvents = {
  added: { tool: Tool };
  activate: { index: number; tool: Tool };
  preview: { operation: PicasaFilter | null };
};
export class Tool {
  constructor(
    public name: string,
    public filterName: string,
    public controller: ImageController,
    public editable: boolean = false
  ) {}
  ui(): _$ {
    throw "notImplemented";
  }
  enable(e: AlbumEntry): boolean {
    throw "notImplemented";
  }
  update(operations: PicasaFilter[], thumbnailContext: string) {
    throw "notImplemented";
  }
  build(..._args: any[]): PicasaFilter {
    throw "notImplemented";
  }
}

export class FilterTool extends Tool {
  private e: _$;
  ui() {
    return (this.e = $(
      `<div class="tool-button"><label>${this.name}</label></div>`
    )
      .on("click", () => {
        this.controller.toggleOperation(this.filterName);
      })
      .on("mouseenter", () => {
        this.controller.preview({ name: this.filterName, args: ["1"] });
      })
      .on("mouseleave", () => {
        this.controller.preview(null);
      }));
  }
  async update(operations: PicasaFilter[], thumbnailContext: string) {
    if (operations.find((o) => o.name === this.filterName)) {
      this.e.css({ border: "solid 1px blue" });
    } else {
      const copy = await cloneContext(
        thumbnailContext,
        "tool " + this.filterName
      );
      await transform(copy, [this.build()]);
      const res = await encode(copy, "image/jpeg", "base64url");
      await destroyContext(copy);
      this.e.css({
        "background-image": `url(${res})`,
        border: "none",
      });
    }
  }
}
