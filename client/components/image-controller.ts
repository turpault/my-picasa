import { buildEmitter, Emitter } from "../../shared/lib/event.js";
import { Queue } from "../../shared/lib/queue.js";
import { AlbumEntry, ImageControllerEvent } from "../../shared/types/types.js";
import { getAlbumInfo } from "../folder-utils.js";
import {
  assetUrl,
  buildContext,
  cloneContext,
  destroyContext,
  encodeToURL,
  setOptions,
  thumbnailUrl,
  transform,
} from "../imageProcess/client.js";
import { $ } from "../lib/dom.js";
import { ImagePanZoomController } from "../lib/panzoom.js";
import { isPicture, isVideo } from "../../shared/lib/utils.js";
import { getService } from "../rpc/connect.js";

export class ImageController {
  constructor(
    image: HTMLImageElement,
    video: HTMLVideoElement,
    panZoomCtrl: ImagePanZoomController
  ) {
    this.image = image;
    this.video = video;
    this.entry = { album: { key: "", name: "" }, name: "" };
    this.context = "";
    this.liveContext = "";
    this.events = buildEmitter<ImageControllerEvent>();
    this.zoomController = panZoomCtrl;
    this.q = new Queue(1);
    this.q.event.on("drain", () => {});
    this.filters = "";
    this.caption = "";
    const i = $(this.image);
    i.on("load", () => {
      this.image.style.display = "";
      this.recenter();
      this.events.emit("idle", {});
      this.events.emit("liveViewUpdated", {
        context: this.liveContext,
        entry: this.entry,
      });
    });
    const parent = i.parent();
    this.parent = parent.get();
    new ResizeObserver(() => this.recenter()).observe(this.parent);
  }

  operationList(): string[] {
    return (this.filters || "").split(";").filter((v) => v);
  }
  operations(): string {
    return this.filters || "";
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

  init(albumEntry: AlbumEntry) {
    this.entry = albumEntry;
    this.display(albumEntry.name);
  }

  async display(name: string) {
    if (this.context) {
      const context = this.context;
      this.context = "";
      await destroyContext(context);
    }
    this.entry.name = name;

    const folderData = await getAlbumInfo(this.entry.album, true);
    const data = folderData.picasa[this.entry.name] || {};
    this.filters = data.filters || "";
    this.caption = data.caption || "";
    if (isPicture(this.entry)) {
      this.image.src = thumbnailUrl(this.entry, "th-large");
      this.image.style.display = "";
      this.video.style.display = "none";
      this.context = await buildContext(this.entry);
    }
    if (isVideo(this.entry)) {
      this.image.style.display = "none";
      this.video.style.display = "";
    }

    this.update();
  }

  async update() {
    if (isPicture(this.entry)) {
      if (await this.rebuildContext()) {
        this.events.emit("updated", {
          context: this.liveContext,
          caption: this.caption,
          filters: this.filters,
        });

        const data = await encodeToURL(this.liveContext, "image/jpeg");
        this.image.src = data;
        this.image.style.display = "none";
      }
    }
    if (isVideo(this.entry)) {
      $(this.video)
        .empty()
        .append(`<source src="${assetUrl(this.entry)}" type="video/mp4">`);
      this.video.load();
      this.video.play();
    }
  }

  async addOperation(expression: string) {
    const lst = this.operationList();
    lst.push(expression);
    this.filters = lst.join(";");
    await Promise.all([this.saveFilterInfo(), this.update()]);
  }

  async updateCaption(caption: string) {
    this.caption = caption;
    await Promise.all([this.saveCaption(), this.update()]);
  }

  async deleteOperation(idx: number) {
    const lst = this.operationList();
    lst.splice(idx, 1);
    this.filters = lst.join(";");
    await Promise.all([this.saveFilterInfo(), this.update()]);
  }
  async moveDown(idx: number) {
    const lst = this.operationList();
    if (idx < lst.length - 1) {
      const op = lst.splice(idx, 1)[0];
      lst.splice(idx + 1, 0, op);
      this.filters = lst.join(";");
      await Promise.all([this.saveFilterInfo(), this.update()]);
    }
  }
  async moveUp(idx: number) {
    if (idx > 0) {
      const lst = this.operationList();
      const op = lst.splice(idx, 1)[0];
      lst.splice(idx - 1, 0, op);
      this.filters = lst.join(";");
      await Promise.all([this.saveFilterInfo(), this.update()]);
    }
  }

  async updateOperation(idx: number, op: string) {
    const lst = this.operationList();
    lst[idx] = op;
    this.filters = lst.join(";");
    await Promise.all([this.saveFilterInfo(), this.update()]);
  }

  async saveFilterInfo() {
    const s = await getService();
    await s.updatePicasaEntry(this.entry, "filters", this.filters);
  }

  async saveCaption() {
    const s = await getService();
    await s.updatePicasaEntry(this.entry, "caption", this.caption);
  }

  recenter() {
    const h = this.parent.clientHeight;
    const w = this.parent.clientWidth;
    this.zoomController!.recenter(w, h);
  }

  private image: HTMLImageElement;
  private video: HTMLVideoElement;
  private entry: AlbumEntry;
  private context: string;
  private liveContext: string;
  private filters: string;
  private caption: string;
  private zoomController?: ImagePanZoomController;
  private q: Queue;
  private parent: HTMLElement;
  events: Emitter<ImageControllerEvent>;
}
