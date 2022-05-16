import { buildEmitter, Emitter } from "../../shared/lib/event";
import { Point, Rectangle } from "ts-2d-geometry/dist";
import { PanZoomEvent } from "../uiTypes";
import createPanZoom, { PanzoomObject } from "@panzoom/panzoom";
import { $, _$ } from "./dom";

export class ImagePanZoomController {
  constructor(c: _$) {
    this.panner = createPanZoom(c.get(), {
      filterKey: function (/* e, dx, dy, dz */) {
        // don't let panzoom handle this event:
        return true;
      },
      panOnlyWhenZoomed: true,
      maxZoom: 10,
      minZoom: 1,
      bounds: true,
      boundsPadding: 1,
      contain: "inside",
      //      bounds: true,
      smoothScroll: false,
    })
    /*;
    this.panner.on("pan", () => {
      this.events.emit("pan", {});
    });

    this.panner.on("zoom", (e: any) => {
      this.events.emit("zoom", e.getTransform());
    });
    */
    this.element = c;
    this.events = buildEmitter<PanZoomEvent>();
  }

  setClientSize(w: number, h: number) {}
  screenToCanvasCoords(x: number, y: number): { x: number; y: number } {
    const transform = {
      ...this.panner.getPan(),
      scale: this.panner.getScale()
    };
    const canvasRatio = this.element.width / this.element.width;
    const targetX = (canvasRatio * (x - transform.x)) / transform.scale;
    const targetY = (canvasRatio * (y - transform.y)) / transform.scale;
    return { x: targetX, y: targetY };
  }

  canvasBoundsOnScreen(): Rectangle {
    const transform = {
      ...this.panner.getPan(),
      scale: this.panner.getScale()
    };
    return new Rectangle(
      new Point(transform.x, transform.y),
      new Point(
        transform.x + transform.scale * this.element.width,
        transform.y + transform.scale * this.element.height
      )
    );
  }

  screenToCanvasRatio(x: number, y: number): { x: number; y: number } {
    const transform = {
      ...this.panner.getPan(),
      scale: this.panner.getScale()
    };
    const canvasRatio = this.element.width / this.element.width;
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
    //this.panner.pan(0, 0);
    //this.panner.zoom(1);
    //this.panner.reset();
    /*this.panner.moveTo(
      (this.clientWidth - this.element.clientWidth) / 2,
      (this.clientHeight - this.element.clientHeight) / 2
    );*/
  }
  enable(enabled: boolean) {
    this.panner.setOptions({disablePan: enabled, disableZoom: enabled});
  }
  rotate(angle: number) {
    $(this.element).css("transform-origin", "50% 50% -1px");
    $(this.element).css("transform", `rotate(${angle}rad`);
  }
  zoom(zoom: number) {
    this.recenter();
    const zoomPos = this.screenToCanvasCoords(
      this.element.width / 2,
      this.element.height / 2
    );
    this.panner.zoom(zoom);
  }
  events: Emitter<PanZoomEvent>;

  private panner: PanzoomObject;
  private element: _$;
}
