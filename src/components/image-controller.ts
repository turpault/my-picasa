import { getFolderInfoFromHandle, updatePicasaData } from "../folder-utils.js";
import {
  buildContext,
  cloneContext,
  destroyContext,
  encode,
  setOptions,
  transform,
} from "../imageProcess/client.js";
import { setImageDataToCanvasElement } from "../lib/dom.js";
import { buildEmitter, Emitter } from "../lib/event.js";
import { jBone as $ } from "../lib/jbone/jbone.js";
import { ImagePanZoomController } from "../lib/panzoom.js";
import { Queue } from "../lib/queue.js";
import { ImageControllerEvent, PicasaFileMeta } from "../types/types.js";

export class ImageController {
  constructor(canvas: HTMLCanvasElement, panZoomCtrl: ImagePanZoomController) {
    this.canvas = canvas;
    this.folder;
    this.context = "";
    this.name = "";
    this.liveContext = "";
    this.events = buildEmitter<ImageControllerEvent>();
    this.zoomController = panZoomCtrl;
    this.q = new Queue(1);
    this.q.event.on("drain", () => {
      this.events.emit("idle", {});
    });
    this.meta = {};
    const parent = $(this.canvas).parent();
    this.parent = parent[0];
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

  init(folder: any, name: string) {
    this.folder = folder;
    this.display(name);
  }

  async display(name: string) {
    if (this.context) {
      const context = this.context;
      this.context = "";
      await destroyContext(context);
    }
    this.name = name;

    const folderData = await getFolderInfoFromHandle(this.folder);
    this.meta = folderData.picasa[this.name] || {};
    const file = await this.folder.getFileHandle(this.name);
    this.context = await buildContext(file);

    this.update();
  }

  async update() {
    this.events.emit("updated", {
      context: this.liveContext,
      meta: this.meta,
    });
    if (await this.rebuildContext()) {
      const data = (await encode(this.liveContext, "raw")) as ImageData;
      setImageDataToCanvasElement(data, this.canvas);
      this.recenter();
      this.events.emit("liveViewUpdated", {
        context: this.liveContext,
      });
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
      lst.splice(idx+1, 0, op);
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
    const folderData = await getFolderInfoFromHandle(this.folder);
    folderData.picasa[this.name] = this.meta;
    await updatePicasaData(this.folder, folderData.picasa);
  }

  recenter() {
    const h = this.parent.clientHeight;
    const w = this.parent.clientWidth;
    this.zoomController!.recenter(w, h);
  }

  private canvas: HTMLCanvasElement;
  private folder: any; // Folder handle
  private name: string;
  private context: string;
  private liveContext: string;
  private meta: PicasaFileMeta;
  private zoomController?: ImagePanZoomController;
  private q: Queue;
  private parent: HTMLElement;
  events: Emitter<ImageControllerEvent>;
}
