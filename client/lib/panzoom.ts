import { buildEmitter, Emitter } from "../../shared/lib/event";
import { Point, Rectangle } from "ts-2d-geometry/dist";
import { PanZoomEvent } from "../uiTypes";
import createPanZoom from "panzoom";


export class ImagePanZoomController {
  constructor(c: HTMLCanvasElement | HTMLImageElement) {
    this.panner = createPanZoom(c, {
      filterKey: function (/* e, dx, dy, dz */) {
        // don't let panzoom handle this event:
        return true;
      },
      maxZoom: 10,
      minZoom: 1,
      bounds: true,
      boundsPadding: 1,
      //      bounds: true,
      smoothScroll: false,
    });
    this.clientWidth = this.clientHeight = 0;
    this.element = c;
    this.events = buildEmitter<PanZoomEvent>();
    this.panner.on("pan", () => {
      this.events.emit("pan", {});
    });

    this.panner.on("zoom", (e: any) => {
      this.events.emit("zoom", e.getTransform());
    });
  }

  setClientSize(w: number, h: number) {
    this.clientWidth = w;
    this.clientHeight = h;
  }
  screenToCanvasCoords(x: number, y: number): { x: number; y: number } {
    const transform = this.panner.getTransform();
    const canvasRatio = this.element.width / this.element.clientWidth;
    const targetX = (canvasRatio * (x - transform.x)) / transform.scale;
    const targetY = (canvasRatio * (y - transform.y)) / transform.scale;
    return { x: targetX, y: targetY };
  }

  canvasBoundsOnScreen(): Rectangle {
    const transform = this.panner.getTransform();
    return new Rectangle(
      new Point(transform.x, transform.y),
      new Point(
        transform.x + transform.scale * this.element.width,
        transform.y + transform.scale * this.element.height
      )
    );
  }

  screenToCanvasRatio(x: number, y: number): { x: number; y: number } {
    const transform = this.panner.getTransform();
    const canvasRatio = this.element.width / this.element.clientWidth;
    const targetX =
      (canvasRatio * (x - transform.x)) / transform.scale / this.element.width;
    const targetY =
      (canvasRatio * (y - transform.y)) / transform.scale / this.element.height;
    return { x: targetX, y: targetY };
  }

  inBounds(bounds: { x: number; y: number }): boolean {
    return (
      bounds.x >= 0 &&
      bounds.y >= 0 &&
      bounds.x < this.element.width &&
      bounds.y < this.element.height
    );
  }

  recenter() {
    this.panner.moveTo(0,0);
    this.panner.zoomAbs(0, 0, 1);
    /*this.panner.moveTo(
      (this.clientWidth - this.element.clientWidth) / 2,
      (this.clientHeight - this.element.clientHeight) / 2
    );*/
  }
  enable(enabled: boolean) {
    if(enabled)
      this.panner.enable()
    else
      this.panner.disable();
  }
  zoom(zoom: number) {
    console.info(this.panner.getTransform());
    this.recenter();
    const zoomPos = this.screenToCanvasCoords(
      this.element.width / 2,
      this.element.height / 2
    );
    this.panner.zoomAbs(zoomPos.x, zoomPos.y, zoom);
  }
  events: Emitter<PanZoomEvent>;
  private clientWidth: number;
  private clientHeight: number;

  private panner: any;
  private element: HTMLCanvasElement | HTMLImageElement;
}
