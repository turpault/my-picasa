import {
  Line,
  LineSegment, Point,
  Rectangle,
  Vector
} from "ts-2d-geometry";
import { decodeRect, encodeRect, isPicture } from "../../shared/lib/utils";
import { ImageController } from "../components/image-controller";
import { ToolRegistrar } from "../components/tools";
import { toolHeader } from "../element-templates";
import { transform } from "../imageProcess/client";
import { $, _$ } from "../lib/dom";
import { ImagePanZoomController } from "../lib/panzoom";


export function setupCrop(
  container: HTMLElement,
  panZoomCtrl: ImagePanZoomController,
  imageCtrl: ImageController,
  toolRegistrar: ToolRegistrar
) {
  const name = "Crop";
  const elem = $(`<div class="crop">
  <div draggable class="crop-top-left crop-corner"></div>
  <div draggable class="crop-top-right crop-corner"></div>
  <div draggable class="crop-bottom-left crop-corner"></div>
  <div draggable class="crop-bottom-right crop-corner"></div>
  <span class="crop-buttons w3-bar w3-blue">
    <button
      class="btn-orientation w3-button w3-bar-item override-pointer-active"
    >
      <i class="fa fa-redo"></i>
    </button>
    <button
      class="btn-5x5 w3-button override-pointer-active w3-bar-item"
    >
      5x5
    </button>
    <button
      class="btn-6x4 w3-button override-pointer-active w3-bar-item"
    >
      6x4
    </button>
    <button
      class="btn-4x3 w3-button override-pointer-active w3-bar-item"
    >
      4x3
    </button>
    <button
      class="btn-16x9 w3-button override-pointer-active w3-bar-item"
    >
      16x9
    </button>
    <button
      class="btn-ok-crop w3-button w3-bar-item override-pointer-active"
    >
      <i class="fa fa-check-circle"></i>
    </button>
    <button
      class="btn-cancel-crop w3-button w3-bar-item override-pointer-active"
    >
      <i class="fa fa-times"></i>
    </button>
  </span>
</div>`);
  const draw = $('<div class="draw"></div>');
  $(container).append(elem);
  $(container).append(draw);

  const tl = $(".crop-top-left", elem);
  const tr = $(".crop-top-right", elem);
  const bl = $(".crop-bottom-left", elem);
  const br = $(".crop-bottom-right", elem);

  const e = elem;

  type modes = "6x4" | "4x3" | "16x9" | "5x5";
  const ratios: {
    [key: string]: number;
  } = {
    "6x4": 6 / 4,
    "4x3": 4 / 3,
    "16x9": 16 / 9,
    "5x5": 1,
  };
  let mode: modes = "4x3";
  let orientation: "paysage" | "portrait" = "paysage";
  e.css({ display: "none" });

  const corners: {
    handle: _$;
    opposite: (c: Rectangle) => Point;
    dir: Vector;
    limits: (c: Rectangle) => Line[];
    css: (p: Point) => any;
  }[] = [
    {
      handle: tr,
      opposite: (current: Rectangle) => {
        return new Point(current.topLeft.x, current.bottomRight.y);
      },
      limits: (current: Rectangle) => {
        return [
          new Line(current.topLeft, new Vector(1, 0)),
          new Line(current.bottomRight, new Vector(0, 1)),
        ];
      },
      dir: new Vector(1, -1),
      css: (projected: Point) => {
        return {
          right: `${container.clientWidth - projected.x}px`,
          top: `${projected.y}px`,
        };
      },
    },
    {
      handle: br,
      opposite: (current: Rectangle): Point => {
        return current.topLeft;
      },
      limits: (current: Rectangle): Line[] => {
        return [
          new Line(current.bottomRight, new Vector(1, 0)),
          new Line(current.bottomRight, new Vector(0, 1)),
        ];
      },
      dir: new Vector(-1, -1),
      css: (projected: Point) => {
        return {
          right: `${container.clientWidth - projected.x}px`,
          bottom: `${container.clientHeight - projected.y}px`,
        };
      },
    },
    {
      handle: tl,
      opposite: (current: Rectangle): Point => {
        return current.bottomRight;
      },
      limits: (current: Rectangle): Line[] => {
        return [
          new Line(current.topLeft, new Vector(1, 0)),
          new Line(current.topLeft, new Vector(0, 1)),
        ];
      },
      dir: new Vector(1, 1),
      css: (projected: Point) => {
        return {
          left: `${projected.x}px`,
          top: `${projected.y}px`,
        };
      },
    },
    {
      handle: bl,
      opposite: (current: Rectangle): Point => {
        return new Point(current.bottomRight.x, current.topLeft.y);
      },
      limits: (current: Rectangle): Line[] => {
        return [
          new Line(current.topLeft, new Vector(0, 1)),
          new Line(current.bottomRight, new Vector(-1, 0)),
        ];
      },
      dir: new Vector(1, -1),
      css: (projected: Point) => {
        return {
          left: `${projected.x}px`,
          bottom: `${container.clientHeight - projected.y}px`,
        };
      },
    },
  ];

  function br2rect(v: DOMRect): Rectangle {
    return new Rectangle(
      new Point(v.x, v.y),
      new Point(v.x + v.width, v.y + v.height)
    );
  }
  let captured = false;
  
  let initialMousePosMove:Point;
  elem
  .on("pointerdown", (ev) => {
    if(ev.target !== elem.get()) {
      return;
    }
    if(ev.buttons === 1) {
      ev.preventDefault();
      ev.stopPropagation();
      elem.get().setPointerCapture(ev.pointerId);
      captured = true;
      initialMousePosMove = new Point(ev.clientX, ev.clientY);
    }
  })
  .on("pointerup", (ev) => {
    if(!captured) {
      return;
    }
    captured = false;
    elem.get().setPointerCapture(ev.pointerId);
    ev.preventDefault();
    ev.stopPropagation();    
  })
  .on("pointermove", (ev) => {
    if (!captured) {
      return;
    }
    ev.preventDefault();
    ev.stopPropagation();    
    const currentPos = new Point(ev.clientX, ev.clientY);
    const deltaX = Math.round(currentPos.x - initialMousePosMove.x);
    const deltaY = Math.round(currentPos.y - initialMousePosMove.y);
    if(ev.buttons === 1 && deltaX !== 0 || deltaY !== 0) {
        elem.css("left", deltaX);
        elem.css("top", deltaY);
        elem.css("right", -deltaX);
        elem.css("bottom", -deltaY);
        initialMousePosMove = currentPos;
      }
    });
  for (const c of corners) {
    c.handle
      .on("pointerdown", (ev) => {
        captured = true;
        ev.preventDefault();
        ev.stopPropagation();
        c.handle.get().setPointerCapture(ev.pointerId);
      })
      .on("pointerup", (ev) => {
        captured = false;
        ev.preventDefault();
        ev.stopPropagation();
        c.handle.get().releasePointerCapture(ev.pointerId);
      })
      .on(
        "pointermove",
        (ev) => {
          if (!captured) {
            return;
          }
          ev.preventDefault();
          ev.stopPropagation();
          const current = br2rect(elem.get().getBoundingClientRect());
          const parent = br2rect(container.getBoundingClientRect());
          if (ev.buttons === 1) {
            const opposite = c
              .opposite(current)
              .translate(-parent.topLeft.x, -parent.topLeft.y);

            const mouseInContainerCoordinates = new Point(
              ev.clientX,
              ev.clientY
            ).translate(-parent.topLeft.x, -parent.topLeft.y);

            const corner = panZoomCtrl.canvasBoundsOnScreen();

            function intersect(p: Point, v: Vector): Point {
              const l = new Line(p, v);
              return c
                .limits(corner)
                .map((lim) => l.intersect(lim).get())
                .sort((a: Point, b: Point) =>
                  p.distanceSquare(a) < p.distanceSquare(b) ? -1 : 1
                )[0];
            }

            let seg1 = new LineSegment(
              opposite,
              intersect(
                opposite,
                new Vector(1 * c.dir.x, ratios[mode] * c.dir.y)
              )
            );
            let seg2 = new LineSegment(
              opposite,
              intersect(
                opposite,
                new Vector(1 * c.dir.x, (1 / ratios[mode]) * c.dir.y)
              )
            );
            const projected1 = seg1.closestPoint(mouseInContainerCoordinates);
            const projected2 = seg2.closestPoint(mouseInContainerCoordinates);

            let projected =
              projected1.distanceSquare(mouseInContainerCoordinates) <
              projected2.distanceSquare(mouseInContainerCoordinates)
                ? projected1
                : projected2;

            elem.css(c.css(projected));
            validate();
            draw.empty();
            draw.append(`<svg xmlns="http://www.w3.org/2000/svg">
              <line stroke-width="5" stroke="black" x1="${opposite.x}" y1="${opposite.y}" x2="${projected.x}"  y2="${projected.y}"/>
              <line stroke-width="1" stroke="black" x1="${opposite.x}" y1="${opposite.y}" x2="${mouseInContainerCoordinates.x}"  y2="${mouseInContainerCoordinates.y}"/>
              <line stroke-width="1" stroke="black" x1="${projected.x}" y1="${projected.y}" x2="${mouseInContainerCoordinates.x}"  y2="${mouseInContainerCoordinates.y}"/>                        
              </svg>`);
          }
        },
        false
      );
  }

  function validate() {
    const current = br2rect(elem.get().getBoundingClientRect());
    const parent = br2rect(container.getBoundingClientRect());
    const r = new Rectangle(
      current.topLeft.translate(-parent.topLeft.x, -parent.topLeft.y),
      current.bottomRight.translate(-parent.topLeft.x, -parent.topLeft.y)
    );
    const img = panZoomCtrl.canvasBoundsOnScreen();
    const v1 = r.topLeft.minus(img.topLeft);
    const v2 = r.bottomRight.minus(img.bottomRight);
    const inBounds = v1.x >= 0 && v1.y >= 0 && v2.x <= 0 && v2.y <= 0;
    ok.addRemoveClass("disabled", !inBounds);
    ok.addRemoveClass("w3-red", !inBounds);
  }

  function resize() {
    let l: number, r: number, t: number, b: number;
    let w: number, h: number;
    h = e.parent().get().clientHeight;
    w = e.parent().get().clientWidth;
    const winRatio = w / h;
    let cropRatio;
    if (orientation === "paysage") {
      cropRatio = ratios[mode];
    } else {
      cropRatio = 1 / ratios[mode];
    }
    if (winRatio < cropRatio) {
      // constraint by width
      const cw = w * 0.1;
      l = +cw;
      r = cw;
      const ch = (h - (w * 0.8) / cropRatio) / 2;
      t = ch;
      b = ch;
    } else {
      const ch = h * 0.1;
      t = ch;
      b = ch;
      const cw = (w - h * 0.8 * cropRatio) / 2;
      l = cw;
      r = cw;
    }

    e.css({ top: `${t}px`, bottom: `${b}px`, left: `${l}px`, right: `${r}px` });
    validate();
  }
  new ResizeObserver(resize).observe(e.parent().get());

  $(".btn-6x4", elem).on("click", () => {
    mode = "6x4";
    resize();
  });
  $(".btn-4x3", elem).on("click", () => {
    mode = "4x3";
    resize();
  });
  $(".btn-16x9", elem).on("click", () => {
    mode = "16x9";
    resize();
  });
  $(".btn-5x5", elem).on("click", () => {
    mode = "5x5";
    resize();
  });
  const ok = $(".btn-ok-crop", elem);
  const cancel = $(".btn-cancel-crop", elem);
  panZoomCtrl.events.on("pan", validate);
  panZoomCtrl.events.on("zoom", validate);

  $(".btn-orientation", elem).on("click", () => {
    orientation = orientation === "portrait" ? "paysage" : "portrait";
    resize();
  });
  ok.on("click", () => {
    //e.style.display = "none";
    const current = br2rect(elem.get().getBoundingClientRect());
    const parent = br2rect(container.getBoundingClientRect());
    const r = new Rectangle(
      current.topLeft.translate(-parent.topLeft.x, -parent.topLeft.y),
      current.bottomRight.translate(-parent.topLeft.x, -parent.topLeft.y)
    );
    const topLeft = panZoomCtrl.screenToCanvasRatio(r.topLeft.x, r.topLeft.y);
    const bottomRight = panZoomCtrl.screenToCanvasRatio(
      r.bottomRight.x,
      r.bottomRight.y
    );
    imageCtrl.addOperation(
      toolRegistrar
        .tool(name)
        .build(topLeft.x, topLeft.y, bottomRight.x, bottomRight.y)
    );
    e.css({ display: "none" });
  });
  cancel.on("click", () => {
    e.css({ display: "none" });
  });
  resize();

  toolRegistrar.registerTool(name, {
    filterName: "crop64",
    enable: (e) => isPicture(e),
    icon: async function (context) {
      // Crop at 50%
      await transform(context, this.build(0.25, 0.25, 0.75, 0.75));
      return true;
    },
    activate: async function () {
      e.css({ display: "block" });
      validate();
      return true;
    },
    build: function (left: number, top: number, right: number, bottom: number) {
      return `${this.filterName}=1,${encodeRect({ left, top, right, bottom })}`;
    },
    buildUI: function (index: number, args: string[]) {
      const e = toolHeader(name, index, imageCtrl);
      const edit = $(`<a style="display="block">Edit</a>`).on(
        "click",
        () => {
          e.css({ display: "block" });
          const rect = decodeRect(args[2])!;
          panZoomCtrl.recenter();
          const img = panZoomCtrl.canvasBoundsOnScreen();
          rect.left

        }
      );
      e.append(edit);
      return e.get()!;
    },
  });
}
