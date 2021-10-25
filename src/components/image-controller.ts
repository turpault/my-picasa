import { getFolderInfoFromHandle, updatePicasaData } from "../folder-utils.js";
import {
  buildContext,
  cloneContext,
  destroyContext,
  encode,
  transform,
} from "../imageProcess/client.js";
import { setImageDataToCanvasElement } from "../lib/dom.js";
import { buildEmitter, Emitter } from "../lib/event.js";
import { ImagePanZoomController } from "../lib/panzoom.js";
import { encodeRect } from "../lib/utils.js";
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
  }

  operationList(): string {
    return this.operations.join(";");
  }

  async rebuildContext() {
    if (this.liveContext) {
      await destroyContext(this.liveContext);
    }
    this.liveContext = await cloneContext(this.context);
    await transform(this.liveContext, this.operationList());
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
    this.description = folderData.picasa[this.name].description;

    const file = await this.folder.getFileHandle(this.name);
    this.context = await buildContext(file);

    this.update();
  }

  async update() {
    await this.rebuildContext();
    const data = (await encode(this.liveContext, "raw")) as ImageData;
    setImageDataToCanvasElement(data, this.canvas);
    this.recenter();
    this.events.emit("updated", {
      context: this.liveContext,
      operations: this.operations,
    });
  }

  async addOperation(expression: string) {
    this.operations.push(expression);
    await Promise.all([this.save(), this.update()]);
  }

  async updateDescription(description: string) {
    this.description = description;
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
    folderData.picasa[this.name].description = this.description;
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
  private description: string;
  private zoomController?: ImagePanZoomController;
  private operations: string[];
  events: Emitter<ImageControllerEvent>;
}
