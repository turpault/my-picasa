import { getFolderInfo, getFolderInfoFromHandle } from "../folder-utils.js";
import {
  buildContext,
  cloneContext,
  destroyContext,
  encode,
  transform,
} from "../imageProcess/client.js";
import { buildEmitter, Emitter } from "../lib/event.js";
import { jBone as $ } from "../lib/jbone/jbone.js";
import { ImagePanZoomController } from "../lib/panzoom.js";
import { encodeRect } from "../lib/utils.js";
import { CropToolEvent, ImageControllerEvent } from "../types/types.js";
import { make as makeCrop } from "./crop.js";

export class ImageController {
  constructor(canvas: HTMLCanvasElement, folder: any, name: string) {
    this.canvas = canvas;
    this.folder = folder;
    this.name = name;
    this.context = "";
    this.liveContext = "";
    this.operations = [];
    this.events = buildEmitter<ImageControllerEvent>();

    this.init();
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

  async init() {
    const file = await this.folder.getFileHandle(this.name);
    const folderData = await getFolderInfoFromHandle(this.folder);
    this.operations = (
      (folderData.picasa[this.name] || {}).filters || ""
    ).split(";");

    this.context = await buildContext(file);
    await this.rebuildContext();
    const data = (await encode(this.liveContext, "raw")) as ImageData;

    this.zoomController = new ImagePanZoomController(this.canvas);
    this.cropTool = makeCrop($("#crop")[0], this.zoomController, this.events);

    setImageDataToCanvasElement(data, this.canvas);
    this.recenter();

    this.cropTool.on("cropped", async ({ topLeft, bottomRight }) => {
      this.addCrop(topLeft, bottomRight);
    });
  }

  async addCrop(
    topLeft: { x: number; y: number },
    bottomRight: { x: number; y: number }
  ) {
    this.operations.push(
      `crop64=${encodeRect({
        x: topLeft.x,
        y: topLeft.y,
        width: bottomRight.x - topLeft.x,
        height: bottomRight.y - topLeft.y,
      })}`
    );
    await this.rebuildContext();
    const data = (await encode(this.liveContext, "raw")) as ImageData;
    setImageDataToCanvasElement(data, this.canvas);
    this.events.emit("operationListChanged", {});
    this.recenter();
  }

  async addSepia() {
    this.operations.push("sepia");
    await this.rebuildContext();
    const data = (await encode(this.liveContext, "raw")) as ImageData;
    setImageDataToCanvasElement(data, this.canvas);
    this.events.emit("operationListChanged", {});
  }

  async onEditOperation(idx: number) {}
  async onDeleteOperation(idx: number) {
    this.operations.splice(idx, 1);
    await this.rebuildContext();
    const data = (await encode(this.liveContext, "raw")) as ImageData;
    setImageDataToCanvasElement(data, this.canvas);
    this.events.emit("operationListChanged", {});
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
  private cropTool?: Emitter<CropToolEvent>;
  private zoomController?: ImagePanZoomController;
  private operations: string[];
  events: Emitter<ImageControllerEvent>;
}

function setImageDataToCanvasElement(
  imagedata: ImageData,
  canvas: HTMLCanvasElement
): void {
  var ctx = canvas.getContext("2d")!;
  canvas.width = imagedata.width;
  canvas.height = imagedata.height;

  ctx.putImageData(imagedata, 0, 0);
}
