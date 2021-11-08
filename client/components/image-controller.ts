import { buildEmitter, Emitter } from "../../shared/lib/event.js";
import { Queue } from "../../shared/lib/queue.js";
import {
  Album,
  AlbumEntry,
  ImageControllerEvent,
  PicasaFileMeta,
} from "../../shared/types/types.js";
import { getAlbumInfo, updatePicasaData } from "../folder-utils.js";
import {
  buildContext,
  cloneContext,
  destroyContext,
  encodeToURL,
  setOptions,
  transform,
} from "../imageProcess/client.js";
import { $ } from "../lib/dom.js";
import { ImagePanZoomController } from "../lib/panzoom.js";

export class ImageController {
  constructor(image: HTMLImageElement, panZoomCtrl: ImagePanZoomController) {
    this.image = image;
    this.entry = { album: { key: "", name: "" }, name: "" };
    this.context = "";
    this.liveContext = "";
    this.events = buildEmitter<ImageControllerEvent>();
    this.zoomController = panZoomCtrl;
    this.q = new Queue(1);
    this.q.event.on("drain", () => {});
    this.meta = {};
    const i = $(this.image);
    i.on("load", () => {
      this.image.style.display = "";
      this.recenter();
      this.events.emit("idle", {});
      this.events.emit("liveViewUpdated", {
        context: this.liveContext,
      });
    });
    const parent = i.parent();
    this.parent = parent.get();
    new ResizeObserver(() => this.recenter()).observe(this.parent);
  }

  operationList(): string[] {
    return (this.meta.filters || "").split(";").filter((v) => v);
  }
  operations(): string {
    return this.meta.filters || "";
  }

  async rebuildContext(): Promise<boolean> {
    this.q.clear();
    this.events.emit("busy", {});
    return this.q.add(async () => {
      if (this.liveContext) {
        await destroyContext(this.liveContext);
      }
      this.liveContext = await cloneContext(this.context);
      await setOptions(this.liveContext, this.meta);
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

    const folderData = await getAlbumInfo(this.entry.album);
    this.meta = folderData.picasa[this.entry.name] || {};
    this.context = await buildContext(this.entry);

    this.update();
  }

  async update() {
    this.events.emit("updated", {
      context: this.liveContext,
      meta: this.meta,
    });
    if (await this.rebuildContext()) {
      const data = await encodeToURL(this.liveContext, "image/jpeg");
      this.image.src = data;
      this.image.style.display = "none";
    }
  }

  async addOperation(expression: string) {
    const lst = this.operationList();
    lst.push(expression);
    this.meta.filters = lst.join(";");
    await Promise.all([this.save(), this.update()]);
  }

  async updateCaption(caption: string) {
    this.meta.caption = caption;
    await Promise.all([this.save(), this.update()]);
  }

  async deleteOperation(idx: number) {
    const lst = this.operationList();
    lst.splice(idx, 1);
    this.meta.filters = lst.join(";");
    await Promise.all([this.save(), this.update()]);
  }
  async moveDown(idx: number) {
    const lst = this.operationList();
    if (idx < lst.length - 1) {
      const op = lst.splice(idx, 1)[0];
      lst.splice(idx + 1, 0, op);
      this.meta.filters = lst.join(";");
      await Promise.all([this.save(), this.update()]);
    }
  }
  async moveUp(idx: number) {
    if (idx > 0) {
      const lst = this.operationList();
      const op = lst.splice(idx, 1)[0];
      lst.splice(idx - 1, 0, op);
      this.meta.filters = lst.join(";");
      await Promise.all([this.save(), this.update()]);
    }
  }

  async updateOperation(idx: number, op: string) {
    const lst = this.operationList();
    lst[idx] = op;
    this.meta.filters = lst.join(";");
    await Promise.all([this.save(), this.update()]);
  }

  async save() {
    const folderData = await getAlbumInfo(this.entry.album);
    folderData.picasa[this.entry.name] = this.meta;
    await updatePicasaData(this.entry.album, folderData.picasa);
  }

  recenter() {
    const h = this.parent.clientHeight;
    const w = this.parent.clientWidth;
    this.zoomController!.recenter(w, h);
  }

  private image: HTMLImageElement;
  private entry: AlbumEntry;
  private context: string;
  private liveContext: string;
  private meta: PicasaFileMeta;
  private zoomController?: ImagePanZoomController;
  private q: Queue;
  private parent: HTMLElement;
  events: Emitter<ImageControllerEvent>;
}
