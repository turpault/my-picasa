import { Line, LineSegment, Point, Rectangle, Vector } from "ts-2d-geometry";
import { RectArea } from "../../../shared/lib/utils";
import { ImageController } from "../../components/image-controller";
import { t } from "../../components/strings";
import { ToolEditor } from "../../components/tool-editor";
import { $, _$ } from "../../lib/dom";
import { State } from "../../lib/state";
import { PicasaMultiButton } from "../../components/controls/multibutton";

export type ValueChangeEvent = {
  updated: { index: number; value: RectArea };
  preview: { index: number; value: RectArea };
  cancel: {};
};
function bounds(point: Point, area: Rectangle) {
  return new Point(
    Math.max(area.topLeft.x, Math.min(area.bottomRight.x, point.x)),
    Math.max(area.topLeft.y, Math.min(area.bottomRight.y, point.y))
  );
}
//export function draggableElement(e: _$, zoomController: PanZoomController): EventEmitter<

const toolControlHtml = `
<div class="crop-controls-pane">
  <div class="crop-controls-title">
  <img src="resources/images/icons/crop.png">
  <h1>${t("Crop Picture")}</h1>
  <h3>${t("Crop Details")}</h3>
  </div>
  <label>${t("Ratio")}</label>
  <picasa-multi-button class="crop-controls crop-ratio-control" selected="0" items="0|1"></picasa-multi-button>
  <label>${t("Orientation")}</label>
  <picasa-multi-button class="crop-controls crop-orientation-control" selected="0" items="Portrait|Paysage"></picasa-multi-button>
  <div class="crop-controls-okcancel">
    <picasa-button type="ok" class="crop-control-ok">${t(
      "Apply"
    )}</picasa-button>
    <picasa-button type="cancel" class="crop-control-cancel">${t(
      "Cancel"
    )}</picasa-button>
  </div>
</div>
`;

const overlayHTML = $(`
<div class="crop">
  <div draggable class="crop-top-left crop-corner"></div>
  <div draggable class="crop-top-right crop-corner"></div>
  <div draggable class="crop-bottom-left crop-corner"></div>
  <div draggable class="crop-bottom-right crop-corner"></div>
</div>
`);

export enum CROP_PREVIEW_STATE {
  AREA = "area",
  ORIENTATION = "orientation",
  RATIO = "ratio",
}

export type CropPreviewStateDef = {
  [CROP_PREVIEW_STATE.AREA]: RectArea;
  [CROP_PREVIEW_STATE.ORIENTATION]: "portrait" | "paysage";
  [CROP_PREVIEW_STATE.RATIO]: keyof typeof RatioList;
};

const RatioList = {
  "4x6": 4 / 6,
  "5x7": 5 / 7,
  "8x10": 8 / 10,
  "4x3": 4 / 3,
  "16x9": 16 / 9,
  "5x5": 1,
  Free: 0,
};
const OrientationList = {
  portrait: "Portrait",
  paysage: "Paysage",
};

export type CropPreviewState = State<CropPreviewStateDef>;

export async function setupCropPreview(
  container: _$,
  toolEditor: ToolEditor,
  imageController: ImageController,
  state: CropPreviewState
) {
  const toolControls = $(toolControlHtml);
  const overlay = $(overlayHTML);

  toolEditor.activate(toolControls, overlay);

  const tl = $(".crop-top-left", overlay);
  const tr = $(".crop-top-right", overlay);
  const bl = $(".crop-bottom-left", overlay);
  const br = $(".crop-bottom-right", overlay);

  const ratioLabels = Object.keys(RatioList).map(t);
  const orientationLabels = Object.keys(OrientationList).map(t);
  $(".crop-ratio-control", toolControls).attr("items", ratioLabels.join("|"));
  $(".crop-orientation-control", toolControls).attr(
    "items",
    orientationLabels.join("|")
  );

  $<PicasaMultiButton>(".crop-orientation-control", toolControls)
    .get()
    .bind(state, CROP_PREVIEW_STATE.ORIENTATION, Object.keys(OrientationList));
  $<PicasaMultiButton>(".crop-ratio-control", toolControls)
    .get()
    .bind(state, CROP_PREVIEW_STATE.RATIO, Object.keys(RatioList));

  if (state.getValue(CROP_PREVIEW_STATE.RATIO) === undefined) {
    state.setValue(CROP_PREVIEW_STATE.RATIO, "4x6");
  }
  if (state.getValue(CROP_PREVIEW_STATE.ORIENTATION) === undefined) {
    state.setValue(CROP_PREVIEW_STATE.ORIENTATION, "paysage");
  }

  const corners: {
    handle: _$;
    opposite: (c: Rectangle) => Point;
    dir: Vector;
    limits: (c: Rectangle) => Line[];
    css: (p: Point) => any;
    updateValue: (value: RectArea, projected: Point) => RectArea;
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
      updateValue: (value: RectArea, projected: Point) => {
        const toValue = imageController.zoomController.screenToCanvasRatio(
          projected.x,
          projected.y
        );
        return {
          ...value,
          right: toValue.x,
          top: toValue.y,
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
      updateValue: (value: RectArea, projected: Point) => {
        const toValue = imageController.zoomController.screenToCanvasRatio(
          projected.x,
          projected.y
        );
        return {
          ...value,
          right: toValue.x,
          bottom: toValue.y,
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
      updateValue: (value: RectArea, projected: Point) => {
        const toValue = imageController.zoomController.screenToCanvasRatio(
          projected.x,
          projected.y
        );
        return {
          ...value,
          left: toValue.x,
          top: toValue.y,
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
      updateValue: (value: RectArea, projected: Point) => {
        const toValue = imageController.zoomController.screenToCanvasRatio(
          projected.x,
          projected.y
        );
        return {
          ...value,
          left: toValue.x,
          bottom: toValue.y,
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
  overlay
    .on("pointerdown", (ev) => {
      if (ev.buttons === 1) {
        ev.preventDefault();
        ev.stopPropagation();
        overlay.get().setPointerCapture(ev.pointerId);
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
      overlay.get().setPointerCapture(ev.pointerId);
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
          const deltaInRatio = imageController.zoomController.deltaScreenToCanvasRatio(
            deltaX,
            deltaY
          );
          const currentValue = state.getValue(CROP_PREVIEW_STATE.AREA);
          const updated = {
            left: currentValue.left + deltaInRatio.x,
            right: currentValue.right + deltaInRatio.x,
            top: currentValue.top + deltaInRatio.y,
            bottom: currentValue.bottom + deltaInRatio.y,
          };
          if (
            updated.left >= 0 &&
            updated.top >= 0 &&
            updated.bottom <= 1 &&
            updated.right <= 1
          ) {
            state.setValue(CROP_PREVIEW_STATE.AREA, updated);
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
          const current = br2rect(overlay.get().getBoundingClientRect());
          const parent = br2rect(container.get()!.getBoundingClientRect());
          if (ev.buttons === 1) {
            const ratio = state.getValue(CROP_PREVIEW_STATE.RATIO);
            if (RatioList[ratio] === 0) {
              const mouseInContainerCoordinates = new Point(
                ev.clientX,
                ev.clientY
              ).translate(-parent.topLeft.x, -parent.topLeft.y);

              const corner = imageController.zoomController.canvasBoundsOnScreen();
              const currentValue = state.getValue(CROP_PREVIEW_STATE.AREA);
              const updatedValue = c.updateValue(
                currentValue,
                bounds(mouseInContainerCoordinates, corner)
              );
              state.setValue(CROP_PREVIEW_STATE.AREA, updatedValue);
              return;
            }
            const opposite = c
              .opposite(current)
              .translate(-parent.topLeft.x, -parent.topLeft.y);

            const mouseInContainerCoordinates = new Point(
              ev.clientX,
              ev.clientY
            ).translate(-parent.topLeft.x, -parent.topLeft.y);

            const corner = imageController.zoomController.canvasBoundsOnScreen();

            const intersect = (p: Point, v: Vector): Point => {
              const l = new Line(p, v);
              return c
                .limits(corner)
                .map((lim) => l.intersect(lim).get())
                .sort(
                  (a: Point, b: Point) =>
                    p.distanceSquare(a) - p.distanceSquare(b)
                )[0];
            };

            let seg1 = new LineSegment(
              opposite,
              intersect(
                opposite,
                new Vector(1 * c.dir.x, RatioList[ratio] * c.dir.y)
              )
            );
            let seg2 = new LineSegment(
              opposite,
              intersect(
                opposite,
                new Vector(1 * c.dir.x, (1 / RatioList[ratio]) * c.dir.y)
              )
            );
            const projected1 = seg1.closestPoint(mouseInContainerCoordinates);
            const projected2 = seg2.closestPoint(mouseInContainerCoordinates);

            let projected =
              projected1.distanceSquare(mouseInContainerCoordinates) <
              projected2.distanceSquare(mouseInContainerCoordinates)
                ? projected1
                : projected2;

            const currentValue = state.getValue(CROP_PREVIEW_STATE.AREA);
            const updatedValue = c.updateValue(currentValue, projected);
            state.setValue(CROP_PREVIEW_STATE.AREA, updatedValue);
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

  state.events.on(CROP_PREVIEW_STATE.AREA, () => {
    const currentValue = state.getValue(CROP_PREVIEW_STATE.AREA);
    const inBounds =
      currentValue.left >= 0 &&
      currentValue.top >= 0 &&
      currentValue.right <= 1 &&
      currentValue.bottom <= 1;
    $(".crop-control-ok", toolControls).addRemoveClass("disabled", !inBounds);
  });
  state.events.on(CROP_PREVIEW_STATE.RATIO, () => {
    let ratio = state.getValue(CROP_PREVIEW_STATE.RATIO);
    const orientation = state.getValue(CROP_PREVIEW_STATE.ORIENTATION);
    const currentValue = state.getValue(CROP_PREVIEW_STATE.AREA);
    // recalculate a good approximation based on the mode and current orientation
    if (RatioList[ratio] === 0) {
      let tmp = currentValue.right;
      currentValue.right = currentValue.bottom;
      currentValue.bottom = tmp;
      state.setValue(CROP_PREVIEW_STATE.AREA, currentValue);
      return;
    }
    const ratioValue =
      orientation == "paysage" ? RatioList[ratio] : 1 / RatioList[ratio];
    const imageRatio =
      imageController.zoomController.naturalDimensions().width /
      imageController.zoomController.naturalDimensions().height;
    if (ratioValue < imageRatio) {
      currentValue.top = 0.1;
      currentValue.bottom = 0.9;
      const w = (0.8 * ratioValue) / imageRatio;
      currentValue.left = (1 - w) / 2;
      currentValue.right = (1 + w) / 2;
    } else {
      currentValue.left = 0.1;
      currentValue.right = 0.9;
      const h = (0.8 / ratioValue) * imageRatio;
      currentValue.top = (1 - h) / 2;
      currentValue.bottom = (1 + h) / 2;
    }
    state.setValue(CROP_PREVIEW_STATE.AREA, currentValue);
  });

  const moveCornersFromValue = () => {
    const currentValue = state.getValue(CROP_PREVIEW_STATE.AREA);
    const topLeft = imageController.zoomController.ratioToScreen(
      currentValue.left,
      currentValue.top
    );
    const bottomRight = imageController.zoomController.ratioToScreen(
      currentValue.right,
      currentValue.bottom
    );
    const parentSize = { width: container.width, height: container.height };
    const fromBottomAndRight = {
      x: parentSize.width - bottomRight.x,
      y: parentSize.height - bottomRight.y,
    };

    overlay.css({
      top: `${topLeft.y}px`,
      bottom: `${fromBottomAndRight.y}px`,
      left: `${topLeft.x}px`,
      right: `${fromBottomAndRight.x}px`,
    });
  };

  state.events.on(CROP_PREVIEW_STATE.AREA, moveCornersFromValue);

  const observer = new ResizeObserver(() => moveCornersFromValue());
  moveCornersFromValue();

  return new Promise<boolean>((resolve) => {
    $(".crop-control-cancel", toolControls).on("click", () => {
      observer.disconnect();
      toolEditor.deactivate();
      resolve(false);
    });
    $(".crop-control-ok", toolControls).on("click", () => {
      observer.disconnect();
      toolEditor.deactivate();
      resolve(true);
    });
  });
}
