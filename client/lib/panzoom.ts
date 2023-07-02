import createPanZoom, { PanZoom, Transform } from "panzoom";
import { Matrix3x3, Point, Rectangle } from "ts-2d-geometry";
import { buildEmitter, Emitter } from "../../shared/lib/event";
import { PanZoomEvent } from "../uiTypes";
import { _$ } from "./dom";

function toMatrix(from: Matrix3x3): string {
  return `matrix(${from.get(0, 0)}, ${from.get(1, 0)}, ${from.get(
    0,
    1
  )}, ${from.get(1, 1)}, ${from.get(0, 2)}, ${from.get(1, 2)})`;
}

export class ImagePanZoomController {
  constructor(c: _$) {
    this.panner = createPanZoom(c.get(), {
      filterKey: function (/* e, dx, dy, dz */) {
        // don't let panzoom handle this event:
        return true;
      },
      //maxZoom: 10,
      //minZoom: 1,
      //bounds: true,
      //boundsPadding: 1,
      // smoothScroll: false,
    });
    this.element = c;
    this.events = buildEmitter<PanZoomEvent>(false);
    this.panner.on("pan", (e: PanZoom) => {
      this.events.emit("pan", e.getTransform());
    });

    this.panner.on("zoom", (e: PanZoom) => {
      this.events.emit("zoom", {
        scale: e.getTransform().scale / e.getMinZoom(),
      });
    });
    this.recenter();
  }

  screenToCanvasCoords(x: number, y: number): { x: number; y: number } {
    const transform = this.panner.getTransform();
    const offsets = { left: this.element.left, top: this.element.top };
    const canvasRatio = this.element.width / this.element.height;
    const targetX =
      (canvasRatio * (x - transform.x - offsets.left)) / transform.scale;
    const targetY =
      (canvasRatio * (y - transform.y - offsets.top)) / transform.scale;
    return { x: targetX, y: targetY };
  }

  canvasToScreenCoords(x: number, y: number): { x: number; y: number } {
    const transform = this.panner.getTransform();
    return {
      x: (x - transform.x) / transform.scale,
      y: (y - transform.y) / transform.scale,
    };
  }

  canvasBoundsOnScreen(): Rectangle {
    const offsets = { left: this.element.left, top: this.element.top };
    const transform = this.panner.getTransform();
    return new Rectangle(
      new Point(transform.x /*+ offsets.left*/, transform.y /*+ offsets.top*/),
      new Point(
        /*offsets.left +*/ transform.x + transform.scale * this.element.width,
        /*offsets.top +*/ transform.y + transform.scale * this.element.height
      )
    );
  }
  deltaScreenToCanvasRatio(x: number, y: number): { x: number; y: number } {
    const transform = this.panner.getTransform();

    /*
    const canvasRatio = this.element.width / this.element.height;
    const targetX =
      (canvasRatio * (x - transform.x - offsets.left)) / transform.scale / this.element.width;
    const targetY =
      (canvasRatio * (y - transform.y - offsets.top)) / transform.scale / this.element.height;
    */
    const targetX = x / (transform.scale * this.element.width);
    const targetY = y / (transform.scale * this.element.height);
    return { x: targetX, y: targetY };
  }

  screenToCanvasRatio(x: number, y: number): { x: number; y: number } {
    const transform = this.panner.getTransform();
    const offsets = { left: this.element.left, top: this.element.top };

    /*
    const canvasRatio = this.element.width / this.element.height;
    const targetX =
      (canvasRatio * (x - transform.x - offsets.left)) / transform.scale / this.element.width;
    const targetY =
      (canvasRatio * (y - transform.y - offsets.top)) / transform.scale / this.element.height;
    */
    const targetX =
      (x - transform.x - offsets.left) / (transform.scale * this.element.width);
    const targetY =
      (y - transform.y - offsets.top) / (transform.scale * this.element.height);
    return { x: targetX, y: targetY };
  }

  ratioToScreen(x: number, y: number): { x: number; y: number } {
    const transform = this.panner.getTransform();
    const offsets = { left: this.element.left, top: this.element.top };
    // const canvasRatio = this.element.width / this.element.height;
    const targetX =
      x * transform.scale * this.element.width + offsets.left + transform.x;
    const targetY =
      y * transform.scale * this.element.height + offsets.top + transform.y;
    return { x: targetX, y: targetY };
  }

  naturalDimensions(): { width: number; height: number } {
    return { width: this.element.width, height: this.element.height };
  }

  async recenter() {
    const [width, height] = [this.element.width, this.element.height];
    if (width === 0 || height === 0) {
      return;
    }
    const [parentWidth, parentHeight] = [
      this.element.parent()!.width,
      this.element.parent()!.height,
    ];
    const initialZoom = Math.min(parentWidth / width, parentHeight / height);
    const initialLeft = (parentWidth - width * initialZoom) / 2;
    const initialTop = (parentHeight - height * initialZoom) / 2;
    this.panner.setMinZoom(initialZoom);
    this.panner.setMaxZoom(initialZoom * 4);
    //this.panner.moveTo(initialLeft, initialTop);
    this.panner.zoomAbs(initialLeft, initialTop, initialZoom);
    this.panner.moveTo(initialLeft, initialTop);

    await this.waitNextFrame();

    if (this.rotation !== 0) {
      this.localTransforms = this.panner.getTransform();
      this.rotate(this.rotation);
    }
  }
  async enable(enabled: boolean) {
    if (enabled) {
      this.rotation = 0;
      this.element.css({
        position: "",
        left: "",
        top: "",
      });
      this.panner.resume();
      await this.waitNextFrame();
    } else {
      this.localTransforms = this.panner.getTransform();
      const matrix = Matrix3x3.identity()
        .scale(this.localTransforms.scale)
        .timesMatrix(
          Matrix3x3.translation(
            -this.localTransforms.x,
            -this.localTransforms.y
          )
        );
      this.element.css({
        "transform-origin": `${0}px ${0}px`,
        position: "relative",
        //left: `${this.localTransforms.x}px`,
        //top: `${this.localTransforms.y}px`,
        transform: toMatrix(matrix),
      });
      this.panner.pause();
      await this.waitNextFrame();
      if (this.rotation !== 0) {
        await this.rotate(this.rotation);
      }
    }
  }
  rotate(angleDeg: number) {
    if (!this.panner.isPaused()) {
      throw new Error("Cannot rotate while panning");
    }
    this.rotation = angleDeg;
    const transform = { ...this.localTransforms! };
    const elemCenter = {
      x: this.element.width / 2,
      y: this.element.height / 2,
    };
    /*this.element.css({
      "transform-origin": `${this.element.width*transform.scale/2}px ${this.element.height*transform.scale/2}px`,
      "transform": `scale(${transform.scale}) rotate(${angle}rad) translate(${transform.x/transform.scale}px, ${transform.y/transform.scale}px)`
    });*/

    //const matrix = JSON.parse(`[${this.localTransforms.slice(7,-1)}]`);
    let matrix = Matrix3x3.translation(
      transform.x / transform.scale,
      transform.y / transform.scale
    ); //Matrix3x3.identity();
    let translation = Matrix3x3.translation(-elemCenter.x, -elemCenter.y);
    let translationBack = Matrix3x3.translation(elemCenter.x, elemCenter.y);
    matrix = matrix.timesMatrix(translationBack);
    matrix = matrix.scale(transform.scale);
    const rotation = Matrix3x3.rotationDegrees(angleDeg);
    matrix = matrix.timesMatrix(rotation);
    matrix = matrix.timesMatrix(translation);
    const values = toMatrix(matrix);
    this.element.css({
      transform: values,
    });
  }

  async zoom(zoom: number) {
    const targetZoom = this.panner.getMinZoom() * zoom;
    //this.recenter();
    const parent = this.element.parent()!;
    this.panner.smoothZoomAbs(parent.width / 2, parent.height / 2, targetZoom);
  }
  private async waitNextFrame() {
    await new Promise((resolve) => requestAnimationFrame(resolve));
  }
  events: Emitter<PanZoomEvent>;
  private localTransforms?: Transform;

  private panner: PanZoom;
  private rotation = 0;
  private element: _$;
}
