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
import { ImagePanZoomController } from "../lib/panzoom.js";
import { Queue } from "../lib/queue.js";
import { ImageControllerEvent } from "../types/types.js";

export class ImageController {
  constructor(canvas: HTMLCanvasElement, panZoomCtrl: ImagePanZoomController) {
    this.canvas = canvas;
    this.folder;
    this.context = "";
    this.name = "";
    this.liveContext = "";
    this.operations = [];
    this.events = buildEmitter<ImageControllerEvent>();
    this.zoomController = panZoomCtrl;
    this.q = new Queue(1);
    this.q.event.on("drain", () => {
      this.events.emit("idle", {});
    });
  }

  operationList(): string {
    return this.operations.join(";");
  }

  async rebuildContext(): Promise<boolean> {
    this.q.clear();
    this.events.emit("busy", {});
    return this.q.add(async () => {
      if (this.liveContext) {
        await destroyContext(this.liveContext);
      }
      this.liveContext = await cloneContext(this.context);
      await setOptions(this.liveContext, {
        caption: this.caption,
      });
      await transform(this.liveContext, this.operationList());
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
    this.operations = ((folderData.picasa[this.name] || {}).filters || "")
      .split(";")
      .filter((v) => v);
    this.caption = folderData.picasa[this.name].caption;

    const file = await this.folder.getFileHandle(this.name);
    this.context = await buildContext(file);

    this.update();
  }

  async update() {
    if (await this.rebuildContext()) {
      const data = (await encode(this.liveContext, "raw")) as ImageData;
      setImageDataToCanvasElement(data, this.canvas);
      this.recenter();
      this.events.emit("updated", {
        context: this.liveContext,
        operations: this.operations,
        caption: this.caption,
      });
    }
  }

  async addOperation(expression: string) {
    this.operations.push(expression);
    await Promise.all([this.save(), this.update()]);
  }

  async updateCaption(caption: string) {
    this.caption = caption;
    await Promise.all([this.save(), this.update()]);
  }

  async deleteOperation(idx: number) {
    this.operations.splice(idx, 1);
    await Promise.all([this.save(), this.update()]);
  }

  async updateOperation(idx: number, op: string) {
    this.operations[idx] = op;
    await Promise.all([this.save(), this.update()]);
  }

  async save() {
    const folderData = await getFolderInfoFromHandle(this.folder);
    folderData.picasa[this.name].caption = this.caption;
    folderData.picasa[this.name].filters = this.operationList();
    await updatePicasaData(this.folder, folderData.picasa);
  }

  recenter() {
    const h = window.innerHeight;
    const w = window.innerWidth;
    this.zoomController!.recenter(w, h);
  }

  private canvas: HTMLCanvasElement;
  private folder: any; // Folder handle
  private name: string;
  private context: string;
  private liveContext: string;
  private caption?: string;
  private zoomController?: ImagePanZoomController;
  private operations: string[];
  private q: Queue;
  events: Emitter<ImageControllerEvent>;
}
