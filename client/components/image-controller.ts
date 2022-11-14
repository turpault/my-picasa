import { buildEmitter, Emitter } from "../../shared/lib/event";
import { Queue } from "../../shared/lib/queue";
import {
  decodeOperations,
  encodeOperations,
  isPicture,
  isVideo,
  PicasaFilter,
} from "../../shared/lib/utils";
import { AlbumEntryPicasa } from "../../shared/types/types";
import {
  assetUrl,
  buildContext,
  cloneContext,
  destroyContext,
  encodeToURL,
  setOptions,
  thumbnailUrl,
  transform,
} from "../imageProcess/client";
import { preLoadImage, _$ } from "../lib/dom";
import { ImagePanZoomController } from "../lib/panzoom";
import { getService } from "../rpc/connect";
import { ImageControllerEvent } from "../uiTypes";

export class ImageController {
  constructor(image: _$, video: _$, panZoomCtrl: ImagePanZoomController) {
    this.image = image;
    this.video = video;
    this.entry = { album: { key: "", name: "" }, name: "", picasa: {} };
    this.context = "";
    this.liveContext = "";
    this.events = buildEmitter<ImageControllerEvent>();
    this.zoomController = panZoomCtrl;
    this.q = new Queue(1);
    this.q.event.on("drain", () => {});
    this.filters = [];
    this.mute = -1;
    this.caption = "";
    this.parent = this.image.parent()!;
    new ResizeObserver(() => this.recenter()).observe(this.parent.get()!);
  }

  operationList(): PicasaFilter[] {
    return this.filters;
  }

  private loaded() {
    this.image.css("display", "");
    this.recenter();

    this.events.emit("idle", {});
  }

  operations(): PicasaFilter[] {
    if (this.mute !== -1) {
      return this.operationList().slice(0, this.mute);
    }
    return this.operationList();
  }
  muteAt(indexToMute: number) {
    this.mute = indexToMute;
    this.update();
  }
  muted() {
    return this.mute;
  }

  async rebuildContext(): Promise<boolean> {
    this.q.clear();
    this.events.emit("busy", {});
    return this.q.add(async () => {
      if (this.liveContext) {
        await destroyContext(this.liveContext);
      }
      this.liveContext = await cloneContext(this.context);
      await setOptions(this.liveContext, { caption: this.caption });
      await transform(this.liveContext, this.operations());
      return true;
    });
  }

  init(albumEntry: AlbumEntryPicasa) {
    this.entry = albumEntry;
    this.display(albumEntry);
  }

  async display(albumEntry: AlbumEntryPicasa) {
    if (this.context) {
      const context = this.context;
      this.context = "";
      await destroyContext(context);
    }
    this.entry = albumEntry;

    const data = this.entry.picasa;
    this.filters = data.filters ? decodeOperations(data.filters) : [];
    this.caption = data.caption || "";
    if (isPicture(this.entry)) {
      this.context = await buildContext(this.entry);
      const url = thumbnailUrl(this.entry, "th-large");
      this.image.css({ display: "" });
      this.video.css({ display: "none" });
      preLoadImage(url).then(() => {
        this.image.attr("src", url);
        this.loaded();
        this.update();
      });
    }
    if (isVideo(this.entry)) {
      this.image.css({ display: "none" });
      this.video.css({ display: "" });
      this.update();
    }
  }

  async preview(operation: PicasaFilter | null) {
    this.previewOperation = operation;
    if (this.liveContext) {
      if (!operation) {
        const url = await encodeToURL(this.liveContext, "image/jpeg");
        this.image.attr("src", url);
      } else {
        const clone = await cloneContext(this.liveContext);
        await transform(clone, [operation]);
        const url = await encodeToURL(clone, "image/jpeg");
        preLoadImage(url).then(() => {
          if (this.previewOperation === operation) {
            this.image.attr("src", url);
          }
          destroyContext(clone);
        });
      }
    }
  }

  async update(updatedEntry?: AlbumEntryPicasa) {
    if (isPicture(this.entry)) {
      if (
        !updatedEntry?.picasa.filters ||
        updatedEntry.picasa.filters !== encodeOperations(this.operations())
      ) {
        if(updatedEntry?.picasa.filters) {
          this.filters = decodeOperations(updatedEntry?.picasa.filters);
        }
        if (await this.rebuildContext()) {
          this.events.emit("updated", {
            context: this.context,
            liveContext: this.liveContext,
            caption: this.caption,
            filters: this.filters,
          });
          this.events.emit("liveViewUpdated", {
            context: this.liveContext,
            original: this.context,
            entry: this.entry,
          });

          const data = await encodeToURL(this.liveContext, "image/jpeg");
          preLoadImage(data)
            .then(() => {
              this.image.attr("src", data);
              this.loaded();
            })
            .catch((e) => {
              // Might fails as it's quite asynchronous
            });
        }
      }
    }
    if (isVideo(this.entry)) {
      this.video
        .empty()
        .append(`<source src="${assetUrl(this.entry)}" type="video/mp4">`);
      const v = this.video.get() as HTMLVideoElement;
      v.load();
      v.play();
    }
  }

  async addOperation(operation: PicasaFilter) {
    this.filters.push(operation);
    await Promise.all([this.saveFilterInfo(), this.update()]);
  }

  async updateCaption(caption: string) {
    this.caption = caption;
    await Promise.all([this.saveCaption(), this.update()]);
  }

  async deleteOperation(idx: number) {
    this.filters.splice(idx, 1);
    await Promise.all([this.saveFilterInfo(), this.update()]);
  }
  async moveDown(idx: number) {
    if (idx < this.filters.length - 1) {
      const op = this.filters.splice(idx, 1)[0];
      this.filters.splice(idx + 1, 0, op);
      await Promise.all([this.saveFilterInfo(), this.update()]);
    }
  }
  async moveUp(idx: number) {
    if (idx > 0) {
      const op = this.filters.splice(idx, 1)[0];
      this.filters.splice(idx - 1, 0, op);
      await Promise.all([this.saveFilterInfo(), this.update()]);
    }
  }

  async updateOperation(idx: number, op: PicasaFilter) {
    this.filters[idx] = op;
    await Promise.all([this.saveFilterInfo(), this.update()]);
  }

  async saveFilterInfo() {
    const s = await getService();
    await s.updatePicasaEntry(
      this.entry,
      "filters",
      encodeOperations(this.filters)
    );
  }

  async saveCaption() {
    const s = await getService();
    await s.updatePicasaEntry(this.entry, "caption", this.caption);
  }

  recenter() {
    const h = this.parent.height;
    const w = this.parent.width;
    this.zoomController!.setClientSize(h, w);
    this.zoomController!.recenter();
  }

  private image: _$;
  private video: _$;
  private entry: AlbumEntryPicasa;
  private context: string;
  private liveContext: string;
  private filters: PicasaFilter[];
  private caption: string;
  private zoomController?: ImagePanZoomController;
  private q: Queue;
  private parent: _$;
  private mute: number;
  private previewOperation: PicasaFilter | null = null;
  events: Emitter<ImageControllerEvent>;
}
