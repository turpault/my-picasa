import { buildEmitter, Emitter } from "../../shared/lib/event";
import { awaiters, lock } from "../../shared/lib/mutex";
import {
  compareAlbumEntry,
  decodeOperations,
  decodeRotate,
  encodeOperations,
  isPicture,
  isVideo,
  PicasaFilter,
  toBase64,
} from "../../shared/lib/utils";
import {
  AlbumEntry,
  AlbumEntryMetaData,
  AlbumEntryPicasa,
  FaceData,
} from "../../shared/types/types";
import {
  assetUrl,
  buildContext,
  cloneContext,
  commit,
  destroyContext,
  encode,
  encodeToURL,
  resizeContextInside,
  setOptions,
  thumbnailUrl,
  transform,
} from "../imageProcess/client";
import { _$, preLoadImage } from "../lib/dom";
import { ImagePanZoomController } from "../lib/panzoom";
import { getService } from "../rpc/connect";
import { AlbumEntrySelectionManager } from "../selection/selection-manager";
import { ImageControllerEvent } from "../uiTypes";

export class ImageController {
  constructor(
    private image: _$,
    private video: _$<HTMLVideoElement>,
    private selectionManager: AlbumEntrySelectionManager,
    private rotate: string = "",
  ) {
    this.entry = undefined;
    this.context = "";
    this.thumbContext = "";
    this.liveContext = "";
    this.events = buildEmitter<ImageControllerEvent>(false);
    this.zoomController = new ImagePanZoomController(this.image);
    this.identify = false;
    this.filters = [];
    this.caption = "";
    this.faces = [];
    this.parent = this.image.parent()!;
    this.image.on("load", () => this.loaded());
    new ResizeObserver(async () => {
      if (!this.entry) {
        return;
      }
      await this.recenter();
      this.events.emit("resized", { entry: this.entry, info: this.info() });
    }).observe(this.parent.get()!);
    this.asyncInit();
  }
  private async asyncInit() {
    const s = await getService();
    this.selectionManager.events.on("activeChanged", async (event) => {
      if (
        !this.entry ||
        compareAlbumEntry(this.entry, this.selectionManager.active()) !== 0
      ) {
        this.entry = this.selectionManager.active();
        if (this.shown) {
          // Redisplay
          this.display();
        }
      }
    });

    s.on("albumEntryAspectChanged", (e: { payload: AlbumEntryPicasa }) => {
      if (!this.entry) {
        return;
      }

      if (e.payload.name === this.entry.name && this.shown) {
        // Note ignore event for now, to support A/B edits
        if (
          encodeOperations(this.filters) !== (e.payload.metadata.filters || "")
        ) {
          this.filters = decodeOperations(e.payload.metadata.filters || "");
          this.update();
        } else if (this.rotate !== (e.payload.metadata.rotate || "")) {
          // We have to reset the whole view, because the rotation is applied
          // before any filter
          // FIXME: It seems not that clean
          this.display();
        }
      }
    });
  }

  operationList(): PicasaFilter[] {
    return this.filters;
  }

  private loaded() {
    if (this.image.attr("src")) {
      console.info("Loaded image");
      this.recenter().then(() => {
        this.events.emit("idle", {});
        this.events.emit("visible", { entry: this.entry, info: this.info() });
      });
      this.image.css("opacity", "1");
    }
  }
  info() {
    return {
      width: this.image.width,
      height: this.image.height,
    };
  }
  operations(): PicasaFilter[] {
    return this.operationList();
  }

  async setIdentifyMode(enable: boolean) {
    if (this.identify !== enable) {
      this.identify = enable;
      await this.update();
    }
  }

  identifyMode() {
    return this.identify;
  }

  async show() {
    if (!this.shown) {
      this.shown = true;
      this.display();
    }
  }
  async hide() {
    this.entry = undefined;
    this.shown = false;
  }

  async display() {
    const { context, thumbContext } = this;
    this.events.emit("busy", {});
    this.image.css({ display: "none" });
    this.video.css({ display: "none" });
    this.image.attr("src", null);
    this.video.empty();
    this.faces = [];

    // Display something only if there is anything to display
    if (this.entry) {
      const s = await getService();
      this.metadata = await s.getAlbumEntryMetadata(this.entry);
      const data = this.metadata;

      //this.caption = data.caption || "";
      if (isPicture(this.entry)) {
        this.filters = data.filters ? decodeOperations(data.filters) : [];
        this.rotate = data.rotate || "";

        // Load the thumbnail first (should already be available)
        const url = thumbnailUrl(this.entry, "th-large");
        this.image.css({ display: "" });
        this.video.css({ display: "none" });
        this.video.get().pause();
        await preLoadImage(url);
        this.image.attr("src", url);

        // Prepare the image contexts (original and mini version)
        this.context = await buildContext(this.entry);
        // Clear thumbcontext - will be rebuilt on first access
        this.thumbContext = "";
        this.update(false);
      }
      if (isVideo(this.entry)) {
        this.image.css({ display: "none" });
        this.video.css({ display: "" });
        this.rotate = data.rotate || "";
        const rotate = decodeRotate(this.rotate);
        if (rotate !== 0) {
          this.video.css({ transform: `rotate(${rotate * 90}deg)` });
        }
        this.update(false);
      }
      if (context) {
        destroyContext(context);
      }
      if (thumbContext) {
        destroyContext(thumbContext);
      }
    }

    this.events.emit("displayed", {});
  }
  async getThumbnailContext() {
    const l = await lock("getThumbnailContext");
    try {
      if (!this.thumbContext) {
        this.thumbContext = await cloneContext(this.context, "thumbView");
        await resizeContextInside(this.thumbContext, 400);
        await commit(this.thumbContext);
      }
      return this.thumbContext;
    } finally {
      l();
    }
  }

  async getLiveThumbnailContext() {
    const l = await lock("getLiveThumbnailContext");
    try {
      if (!this.liveThumbContext) {
        this.liveThumbContext = await cloneContext(
          await this.getThumbnailContext(),
          "thumbViewWithFilters",
        );
        await setOptions(this.liveThumbContext, { caption: this.caption });
        await transform(this.liveThumbContext, this.operations());
        await commit(this.liveThumbContext);
      }
      return this.liveThumbContext;
    } finally {
      l();
    }
  }
  async preview(operation: PicasaFilter | null) {
    if (operation && this.hasFilter(operation.name)) {
      return;
    }
    this.previewOperation = operation;
    if (this.liveContext) {
      if (!operation) {
        const url = await encodeToURL(this.liveContext, "image/jpeg");
        this.image.attr("src", url);
      } else {
        try {
          const clone = await cloneContext(
            await this.getLiveThumbnailContext(),
            "preview",
          );
          await transform(clone, [operation]);
          const url = await encode(clone, "image/jpeg", "base64url");
          if (this.previewOperation === operation) {
            this.image.attr("src", url.data);
          }
          destroyContext(clone);
        } catch (e) {}
      }
    }
  }

  /**
   * Update the image with the current filter list
   * @returns
   */
  private async update(progressive: boolean = true) {
    if (!this.entry) {
      return;
    }
    const lockName = "image-update";
    if (isPicture(this.entry)) {
      const l = await lock(lockName);
      this.clearLiveContexts();
      try {
        let thumb: string = "";
        if (progressive) {
          // clear the image immediately
          console.info("clearing image");
          this.image.attr(
            "src",
            "data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==",
          );
          // Apply the new filter list to the thumbnail image
          thumb = await this.getLiveThumbnailContext();
          if (awaiters(lockName) > 1) {
            return;
          }
          const data = await encodeToURL(thumb, "image/jpeg");
          await preLoadImage(data);
          if (awaiters(lockName) > 1) {
            return;
          }
          console.info("showing image thumb");
          this.image.attr("src", data);
        }
        // Apply the new filter list to the live image
        const liveContext = await cloneContext(this.context, "liveView");
        await setOptions(liveContext, { caption: this.caption });
        if (this.identify) {
          if (this.faces.length > 0) {
            const faceTransform: string[] = [];
            for (const face of this.faces) {
              faceTransform.push(
                toBase64(JSON.stringify([face.label, face.rect, "#FF0000"])),
              );
            }
            await transform(liveContext, [
              { name: "identify", args: ["1", ...faceTransform] },
            ]);
          }
        }
        // Apply the filters
        await transform(liveContext, this.operations());
        if (awaiters(lockName) > 1) {
          console.warn("__ ABORT __");
          return;
        }
        const data = await encodeToURL(liveContext, "image/jpeg");
        await preLoadImage(data);
        if (awaiters(lockName) > 1) {
          return;
        }

        console.info("showing real image ");
        this.image.css("opacity", "0");
        this.image.attr("src", data);

        this.liveContext = liveContext;
        this.events.emit("updated", {
          caption: this.caption,
          filters: this.filters,
          entry: this.entry,
        });
      } catch (e) {
        console.error(e);
      } finally {
        l();
      }
    }
    if (isVideo(this.entry)) {
      this.video
        .empty()
        .append(`<source src="${assetUrl(this.entry)}" type="video/mp4">`);
      const v = this.video.get();
      v.load();
      v.play();
      this.events.emit("idle", {});
    }
  }

  private clearLiveContexts() {
    if (this.liveContext) {
      destroyContext(this.liveContext);
      this.liveContext = "";
    }
    if (this.liveThumbContext) {
      destroyContext(this.liveThumbContext);
      this.liveThumbContext = "";
    }
  }
  hasFilter(name: string) {
    return this.operationFromName(name) !== undefined;
  }
  operationFromName(name: string) {
    return this.filters.find((f) => f.name === name);
  }
  async toggleOperation(name: string) {
    if (this.hasFilter(name)) {
      return this.deleteOperation(name);
    } else {
      return this.addOperation({ name, args: ["1"] });
    }
  }

  async addOperation(operation: PicasaFilter) {
    this.filters.push(operation);
    await this.saveFilterInfo();
    await this.update();
    return this.filters.length - 1;
  }

  async updateCaption(caption: string) {
    this.caption = caption;
    await this.saveCaption();
    await this.update();
  }

  async deleteOperation(name: string) {
    const idx = [...this.filters].findIndex((f) => f.name === name);
    if (idx !== -1) {
      this.filters.splice(idx, 1);
      await this.saveFilterInfo();
      await this.update();
    }
  }
  async moveDown(idx: number) {
    if (idx < this.filters.length - 1) {
      const op = this.filters.splice(idx, 1)[0];
      this.filters.splice(idx + 1, 0, op);
      await this.saveFilterInfo();
      await this.update();
    }
  }
  async moveUp(idx: number) {
    if (idx > 0) {
      const op = this.filters.splice(idx, 1)[0];
      this.filters.splice(idx - 1, 0, op);
      await this.saveFilterInfo();
      await this.update();
    }
  }

  async updateOperation(op: PicasaFilter, index: number = -1) {
    const filterIndex =
      index === -1 ? this.filters.findIndex((f) => f.name === op.name) : index;
    if (filterIndex !== -1) {
      this.filters[filterIndex].args = op.args;
    } else {
      this.filters.push(op);
    }
    await this.saveFilterInfo();
    await this.update();
  }

  async saveFilterInfo() {
    const s = await getService();
    await s.setFilters(this.entry, encodeOperations(this.filters));
  }

  async saveCaption() {
    const s = await getService();
    await s.setCaption(this.entry, this.caption);
  }

  async recenter() {
    await this.zoomController.recenter();
  }
  async enableZoom(enable: boolean) {
    return this.zoomController.enable(enable);
  }

  zoom(ratio: number) {
    this.zoomController.zoom(ratio);
  }

  private entry: AlbumEntry | undefined;
  private metadata: AlbumEntryMetaData;
  private context: string;
  private liveContext: string;
  private thumbContext: string;
  private liveThumbContext: string;
  private filters: PicasaFilter[];
  private caption: string;
  public zoomController: ImagePanZoomController;
  private identify: boolean;
  private parent: _$;
  private faces: FaceData[];
  private previewOperation: PicasaFilter | null = null;
  private shown = false;
  events: Emitter<ImageControllerEvent>;
}
