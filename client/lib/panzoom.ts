import { PanZoomEvent } from "../../shared/types/types.js";
import { buildEmitter, Emitter } from "../../shared/lib/event.js";

declare var panzoom: Function;

export class ImagePanZoomController {
  constructor(c: HTMLCanvasElement | HTMLImageElement) {
    this.panner = panzoom(c);
    this.element = c;
    this.events = buildEmitter<PanZoomEvent>();
    this.panner.on("pan", () => {
      this.events.emit("pan", {});
    });

    this.panner.on("zoom", () => {
      this.events.emit("zoom", {});
    });
  }

  screenToCanvasCoords(x: number, y: number): { x: number; y: number } {
    const transform = this.panner.getTransform();
    const canvasRatio = this.element.width / this.element.clientWidth;
    const targetX = (canvasRatio * (x - transform.x)) / transform.scale;
    const targetY = (canvasRatio * (y - transform.y)) / transform.scale;
    return { x: targetX, y: targetY };
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

  recenter(screenWidth: number, screenHeight: number) {
    this.panner.zoomAbs(0, 0, 1);
    this.panner.moveTo(
      (screenWidth - this.element.clientWidth) / 2,
      (screenHeight - this.element.clientHeight) / 2
    );
  }
  events: Emitter<PanZoomEvent>;

  private panner: any;
  private element: HTMLCanvasElement | HTMLImageElement;
}
