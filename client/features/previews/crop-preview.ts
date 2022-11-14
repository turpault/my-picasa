import { Line, LineSegment, Point, Rectangle, Vector } from "ts-2d-geometry";
import { RectRange } from "../../../shared/lib/utils";
import { $, _$ } from "../../lib/dom";
import { Emitter } from "../../../shared/lib/event";
import { ImagePanZoomController } from "../../lib/panzoom";
import { del } from "../../lib/idb-keyval";

export type ValueChangeEvent = {
  updated: { index: number; value: RectRange };
  preview: { index: number; value: RectRange };
  cancel: {};
};

export function setupCropPreview(
  container: _$,
  emitter: Emitter<ValueChangeEvent>,
  panZoomCtrl: ImagePanZoomController
) {
  let currentValue: RectRange;
  let activeIndex: number = -1;
  const elem = $(`<div class="crop hidden">
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
  const draw = $('<div class="draw hidden"></div>');
  $(container).append(elem);
  $(container).append(draw);

  const tl = $(".crop-top-left", elem);
  const tr = $(".crop-top-right", elem);
  const bl = $(".crop-bottom-left", elem);
  const br = $(".crop-bottom-right", elem);

  type modes = "6x4" | "4x3" | "16x9" | "5x5";
  const ratios = {
    "6x4": 6 / 4,
    "4x3": 4 / 3,
    "16x9": 16 / 9,
    "5x5": 1,
  };
  let mode: modes = "4x3";
  let orientation: "paysage" | "portrait" = "paysage";

  const corners: {
    handle: _$;
    opposite: (c: Rectangle) => Point;
    dir: Vector;
    limits: (c: Rectangle) => Line[];
    css: (p: Point) => any;
    updateValue: (value: RectRange, projected: Point) => RectRange;
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
          right: `${container.width - projected.x}px`,
          top: `${projected.y}px`,
        };
      },
      updateValue: (value: RectRange, projected: Point) => {
        const toValue = panZoomCtrl.screenToCanvasRatio(projected.x, projected.y);
        return {
          ...value,          
          right: toValue.x,
          top: toValue.y
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
          right: `${container.width - projected.x}px`,
          bottom: `${container.height - projected.y}px`,
        };
      },
      updateValue: (value: RectRange, projected: Point) => {
        const toValue = panZoomCtrl.screenToCanvasRatio(projected.x, projected.y);
        return {
          ...value,          
          right: toValue.x,
          bottom: toValue.y
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
      updateValue: (value: RectRange, projected: Point) => {
        const toValue = panZoomCtrl.screenToCanvasRatio(projected.x, projected.y);
        return {
          ...value,          
          left: toValue.x,
          top: toValue.y
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
          bottom: `${container.height - projected.y}px`,
        };
      },
      updateValue: (value: RectRange, projected: Point) => {
        const toValue = panZoomCtrl.screenToCanvasRatio(projected.x, projected.y);
        return {
          ...value,          
          left: toValue.x,
          bottom: toValue.y
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

  let initialMousePosMove: Point | undefined;
  elem
    .on("pointerdown", (ev) => {
      if (ev.target !== elem.get()) {
        return;
      }
      if (ev.buttons === 1) {
        ev.preventDefault();
        ev.stopPropagation();
        elem.get().setPointerCapture(ev.pointerId);
        captured = true;
        initialMousePosMove = new Point(ev.clientX, ev.clientY);
      }
    })
    .on("pointerup", (ev) => {
      if (!captured) {
        return;
      }
      initialMousePosMove = undefined;
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
      if (initialMousePosMove) {
        const deltaX = Math.round(currentPos.x - initialMousePosMove.x);
        const deltaY = Math.round(currentPos.y - initialMousePosMove.y);
        
        if ((ev.buttons === 1 && deltaX !== 0) || deltaY !== 0) {
          const deltaInRatio = panZoomCtrl.deltaScreenToCanvasRatio(deltaX, deltaY);
          const updated = {
            left: currentValue.left + deltaInRatio.x,
            right: currentValue.right + deltaInRatio.x,
            top: currentValue.top + deltaInRatio.y,
            bottom: currentValue.bottom + deltaInRatio.y,
          };
          if(updated.left >=0 && updated.top >= 0 && updated.bottom <= 1 && updated.right <=1) {
            emitter.emit('preview', {index: activeIndex, value:updated});
          }
          initialMousePosMove = currentPos;
        }
      } else {
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
          const parent = br2rect(container.get()!.getBoundingClientRect());
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

            const updatedValue = c.updateValue(currentValue, projected);
            emitter.emit('preview', {index: activeIndex, value: updatedValue});
            /*draw.empty();
            draw.append(`<svg xmlns="http://www.w3.org/2000/svg">
              <line stroke-width="5" stroke="black" x1="${opposite.x}" y1="${opposite.y}" x2="${projected.x}"  y2="${projected.y}"/>
              <line stroke-width="1" stroke="black" x1="${opposite.x}" y1="${opposite.y}" x2="${mouseInContainerCoordinates.x}"  y2="${mouseInContainerCoordinates.y}"/>
              <line stroke-width="1" stroke="black" x1="${projected.x}" y1="${projected.y}" x2="${mouseInContainerCoordinates.x}"  y2="${mouseInContainerCoordinates.y}"/>                        
              </svg>`);*/
          }
        },
        false
      );
  }

  function updatePreview() {
    emitter.emit("preview", {
      index: activeIndex,
      value: currentValue,
    });
  }

  function refreshButtonStates() {
    const inBounds = currentValue.left>= 0 && currentValue.top >=0 && currentValue.right <=1 && currentValue.bottom <= 1;
    ok.addRemoveClass("disabled", !inBounds);
    ok.addRemoveClass("w3-red", !inBounds);
  }
  
  function modeChanged() {
    // recalculate a good approximation based on the mode and current orientation
    const ratio = orientation == "paysage" ? ratios[mode] : 1/ratios[mode];
    const imageRatio = panZoomCtrl.naturalDimensions().width / panZoomCtrl.naturalDimensions().height;
    if(ratio < imageRatio) {
      currentValue.top = 0.1; currentValue.bottom = 0.9;
      const w = 0.8 * ratio / imageRatio ;
      currentValue.left = (1-w)/2;
      currentValue.right = (1+w)/2;
    } else {
      currentValue.left = 0.1; currentValue.right = 0.9;
      const h = 0.8 / ratio * imageRatio ;
      currentValue.top = (1-h)/2;
      currentValue.bottom = (1+h)/2;
    }
    updatePreview();
  }

  function moveCornersFromValue(initialValue: RectRange) {
    if (activeIndex == -1) {
      return;
    }
    const topLeft = panZoomCtrl.ratioToScreen(initialValue.left, initialValue.top);
    const bottomRight = panZoomCtrl.ratioToScreen(initialValue.right, initialValue.bottom);
    const parentSize = {width: container.width, height: container.height};
    const fromBottomAndRight = { x: parentSize.width - bottomRight.x, y: parentSize.height - bottomRight.y};

    elem.css({
      top: `${topLeft.y}px`,
      bottom: `${fromBottomAndRight.y}px`,
      left: `${topLeft.x}px`,
      right: `${fromBottomAndRight.x}px`,
    });
  }

  $(".btn-6x4", elem).on("click", () => {
    mode = "6x4";
    modeChanged();
  });
  $(".btn-4x3", elem).on("click", () => {
    mode = "4x3";
    modeChanged();
  });
  $(".btn-16x9", elem).on("click", () => {
    mode = "16x9";
    modeChanged();
  });
  $(".btn-5x5", elem).on("click", () => {
    mode = "5x5";
    modeChanged();
  });
  const ok = $(".btn-ok-crop", elem);
  const cancel = $(".btn-cancel-crop", elem);
  panZoomCtrl.events.on("pan", () => {
    if (activeIndex != -1) refreshButtonStates();
  });
  panZoomCtrl.events.on("zoom", () => {
    if (activeIndex != -1) refreshButtonStates();
  });

  $(".btn-orientation", elem).on("click", () => {
    orientation = orientation === "portrait" ? "paysage" : "portrait";
    modeChanged();
  });
  ok.on("click", () => {
    emitter.emit("updated", {
      index: activeIndex,
      value: currentValue,
    });
  });
  cancel.on("click", () => {
    emitter.emit("cancel", {});
  });
  emitter.on("preview", (event) => {
    if (event.index === activeIndex) {
      currentValue = event.value;
      moveCornersFromValue(currentValue);
      refreshButtonStates();
    }
  });
  const observer = new ResizeObserver(()=>{
    if (activeIndex!==-1) {
      moveCornersFromValue(currentValue);
      refreshButtonStates();
    }
  });

  return {
    show: (index: number, initialValue: RectRange) => {
      currentValue = initialValue;
      activeIndex = index;
      const dimensions = panZoomCtrl.naturalDimensions();
      // calculate ratio
      const w = (initialValue.right - initialValue.left) * dimensions.width;
      const h = (initialValue.bottom - initialValue.top) * dimensions.height;
      const ratio = w / h;

      let closestPair: [keyof typeof ratios, number, typeof orientation] = [
        "5x5",
        Number.MAX_VALUE,
        "paysage",
      ];
      for (const [templateRatio, value] of Object.entries(ratios)) {
        if (Math.abs(value - ratio) < closestPair[1]) {
          closestPair = [
            templateRatio as any,
            Math.abs(value - ratio),
            "paysage",
          ];
        }
        if (Math.abs(1 / value - ratio) < closestPair[1]) {
          closestPair = [
            templateRatio as any,
            Math.abs(1 / value - ratio),
            "portrait",
          ];
        }
      }
      mode = closestPair[0];
      orientation = closestPair[2];
      moveCornersFromValue(initialValue);
      elem.removeClass('hidden');
      draw.removeClass('hidden');
      observer.observe(elem.parentElement()!);
    },
    hide: () => {
      activeIndex = -1;
      elem.addClass('hidden');
      draw.addClass('hidden');
      observer.unobserve(elem.parentElement()!);
    },
  };
}
