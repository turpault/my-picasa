import { Line, LineSegment, Point, Rectangle, Vector } from "ts-2d-geometry";
import { debounced, RectArea } from "../../../shared/lib/utils";
import { Orientation } from "../../../shared/types/types";
import { PicasaMultiButton } from "../../components/controls/multibutton";
import { ImageController } from "../../components/image-controller";
import { t } from "../../components/strings";
import { ToolEditor } from "../../components/tool-editor";
import { $, _$ } from "../../lib/dom";
import { State } from "../../lib/state";
import { toolHTML } from "../baseTool";

export type ValueChangeEvent = {
  updated: { index: number; value: RectArea };
  preview: { index: number; value: RectArea };
  cancel: {};
};
function bounds(point: Point, area: Rectangle) {
  return new Point(
    Math.max(area.topLeft.x, Math.min(area.bottomRight.x, point.x)),
    Math.max(area.topLeft.y, Math.min(area.bottomRight.y, point.y)),
  );
}
//export function draggableElement(e: _$, zoomController: PanZoomController): EventEmitter<

export enum CROP_PREVIEW_STATE {
  AREA = "area",
  ORIENTATION = "orientation",
  RATIO = "ratio",
}

export type CropPreviewStateDef = {
  [CROP_PREVIEW_STATE.AREA]: RectArea;
  [CROP_PREVIEW_STATE.ORIENTATION]: Orientation;
  [CROP_PREVIEW_STATE.RATIO]: keyof typeof RatioList;
};

const RatioList = {
  "4x6": "4x6",
  "5x7": "5x7",
  "8x10": "8x10",
  "4x3": "4x3",
  "16x9": "16x9",
  "5x5": "5x5",
  Free: "Free",
};

const Ratios = {
  "4x6": 4 / 6,
  "5x7": 5 / 7,
  "8x10": 8 / 10,
  "4x3": 3 / 4,
  "16x9": 9 / 16,
  "5x5": 1,
  Free: 0,
};

const OrientationList = {
  Portrait: Orientation.PORTRAIT,
  Paysage: Orientation.PAYSAGE,
};

const toolControlHtml = `
<div class="crop-controls-pane">
  <label>${t("Ratio")}</label>
  <picasa-multi-button class="crop-controls crop-ratio-control" selected="0" items="0|1"></picasa-multi-button>
  <label>${t("Orientation")}</label>
  <picasa-multi-button class="crop-controls crop-orientation-control" selected="0" items=""></picasa-multi-button>
</div>
`;

const overlayHTML = `
<div class="crop">
  <div draggable class="crop-top-left crop-corner"></div>
  <div draggable class="crop-top-right crop-corner"></div>
  <div draggable class="crop-bottom-left crop-corner"></div>
  <div draggable class="crop-bottom-right crop-corner"></div>
</div>
`;

export type CropPreviewState = State<CropPreviewStateDef>;

export async function setupCropPreview(
  container: _$,
  toolEditor: ToolEditor,
  imageController: ImageController,
  state: CropPreviewState,
) {
  return new Promise<boolean>((resolve) => {
    const observer = new ResizeObserver(() => moveCornersFromValue());
    const ok = () => {
      observer.disconnect();
      toolEditor.deactivate();
      resolve(true);
    };
    const cancel = () => {
      observer.disconnect();
      toolEditor.deactivate();
      resolve(false);
    };
    const trash = () => {
      observer.disconnect();
      toolEditor.deactivate();
      resolve(null);
    };
    const {
      toolElement: toolControls,
      okControl,
      controls,
    } = toolHTML(
      "Crop Picture",
      "Crop Details",
      "resources/images/icons/crop.png",
      ok,
      cancel,
      trash,
    );
    const overlay = $(overlayHTML);
    controls.append(toolControlHtml);

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
      orientationLabels.join("|"),
    );

    const corners: {
      handle: _$;
      dir: (ratio: number) => Vector;
      css: (p: Point) => any;
      updateAreaWithDelta: (
        c: RectArea,
        delta: Vector,
        ratio: number,
      ) => RectArea;
      name: string;
    }[] = [
      {
        name: "topright",
        handle: tr,
        dir: (ratio) => new Vector(-1, ratio),
        css: (projected: Point) => {
          return {
            right: `${container.width - projected.x}px`,
            top: `${projected.y}px`,
          };
        },
        updateAreaWithDelta: (
          value: RectArea,
          delta: Vector,
          ratio: number,
        ) => {
          return adjustCorners(
            {
              ...value,
              right: value.right + delta.x,
              top: value.top + delta.y,
            },
            "ratio",
            ratio,
          );
        },
      },
      {
        handle: br,
        name: "bottomright",
        updateAreaWithDelta: (
          value: RectArea,
          delta: Vector,
          ratio: number,
        ) => {
          return adjustCorners(
            {
              ...value,
              right: value.right + delta.x,
              bottom: value.bottom + delta.y,
            },
            "ratio",
            ratio,
          );
        },
        dir: (ratio) => new Vector(-1, -ratio),
        css: (projected: Point) => {
          return {
            right: `${container.width - projected.x}px`,
            bottom: `${container.height - projected.y}px`,
          };
        },
      },
      {
        handle: tl,
        name: "topleft",
        updateAreaWithDelta: (
          value: RectArea,
          delta: Vector,
          ratio: number,
        ) => {
          return adjustCorners(
            {
              ...value,
              left: value.left + delta.x,
              top: value.top + delta.y,
            },
            "ratio",
            ratio,
          );
        },
        dir: (ratio) => new Vector(1, ratio),
        css: (projected: Point) => {
          return {
            left: `${projected.x}px`,
            top: `${projected.y}px`,
          };
        },
      },
      {
        handle: bl,
        name: "bottomleft",
        updateAreaWithDelta: (
          value: RectArea,
          delta: Vector,
          ratio: number,
        ) => {
          return adjustCorners(
            {
              ...value,
              left: value.left + delta.x,
              bottom: value.bottom + delta.y,
            },
            "ratio",
            ratio,
          );
        },
        dir: (ratio) => new Vector(1, -ratio),
        css: (projected: Point) => {
          return {
            left: `${projected.x}px`,
            bottom: `${container.height - projected.y}px`,
          };
        },
      },
    ];

    let captured = false;
    let cornerCaptured = false;

    let initialMousePosMove: Point | undefined;
    overlay
      .on("pointerdown", (ev) => {
        console.info(
          "overlay down",
          "image=" + imageController.activeEntry().name,
          "ev.buttons=" + ev.buttons,
          "captured=" + captured,
        );
        if (ev.buttons === 1) {
          overlay.get().setPointerCapture(ev.pointerId);
          captured = true;
          initialMousePosMove = new Point(ev.clientX, ev.clientY);
          ev.stopImmediatePropagation();
        }
        return;
      })
      .on("pointerup", (ev) => {
        console.info(
          "overlay up",
          "image=" + imageController.activeEntry().name,
          "ev.buttons=" + ev.buttons,
          "captured=" + captured,
        );
        if (!captured) {
          return;
        }
        initialMousePosMove = undefined;
        captured = false;
        overlay.get().setPointerCapture(ev.pointerId);
        ev.stopImmediatePropagation();
        return;
      })
      .on("pointermove", (ev) => {
        console.info(
          "overlay move",
          "image=" + imageController.activeEntry().name,
          "ev.buttons=" + ev.buttons,
          "captured=" + captured,
        );
        if (ev.buttons === 0 && captured) {
          captured = false;
          return;
        }
        if (!captured) {
          return;
        }
        const currentPos = new Point(ev.clientX, ev.clientY);
        if (initialMousePosMove) {
          const deltaX = Math.round(currentPos.x - initialMousePosMove.x);
          const deltaY = Math.round(currentPos.y - initialMousePosMove.y);

          if ((ev.buttons === 1 && deltaX !== 0) || deltaY !== 0) {
            const deltaInRatio =
              imageController.zoomController.deltaScreenToCanvasRatio(
                deltaX,
                deltaY,
              );
            const currentValue = state.getValue(CROP_PREVIEW_STATE.AREA);
            const updated = adjustCorners(
              {
                left: currentValue.left + deltaInRatio.x,
                right: currentValue.right + deltaInRatio.x,
                top: currentValue.top + deltaInRatio.y,
                bottom: currentValue.bottom + deltaInRatio.y,
              },
              "slide",
              0,
            );

            state.setValue(CROP_PREVIEW_STATE.AREA, updated);

            initialMousePosMove = currentPos;
          }
        } else {
          initialMousePosMove = currentPos;
        }
        return;
      });
    for (const c of corners) {
      c.handle
        .on("pointerdown", (ev) => {
          console.info(
            "corner down",
            c.name,
            "image=" + imageController.activeEntry().name,
            "ev.buttons=" + ev.buttons,
            "captured=" + cornerCaptured,
          );
          cornerCaptured = true;
          c.handle.get().setPointerCapture(ev.pointerId);
          initialMousePosMove = new Point(ev.clientX, ev.clientY);
          ev.stopImmediatePropagation();
        })
        .on("pointerup", (ev) => {
          console.info(
            "corner up",
            c.name,
            "image=" + imageController.activeEntry().name,
            "ev.buttons=" + ev.buttons,
            "captured=" + cornerCaptured,
          );
          cornerCaptured = false;
          c.handle.get().releasePointerCapture(ev.pointerId);
          ev.stopImmediatePropagation();
        })
        .on("pointermove", (ev) => {
          console.info(
            "corner move",
            c.name,
            "image=" + imageController.activeEntry().name,
            "ev.buttons=" + ev.buttons,
            "captured=" + cornerCaptured,
          );
          // Might have missed the pointerup event
          if (ev.buttons === 0 && cornerCaptured) {
            cornerCaptured = false;
            return;
          }
          if (!cornerCaptured) {
            return;
          }
          ev.stopImmediatePropagation();

          const ratio = Ratios[state.getValue(CROP_PREVIEW_STATE.RATIO)];
          if (ev.buttons === 1 && initialMousePosMove) {
            const currentPos = new Point(ev.clientX, ev.clientY);
            const deltaX = Math.round(currentPos.x - initialMousePosMove.x);
            const deltaY = Math.round(currentPos.y - initialMousePosMove.y);

            if (deltaX !== 0 || deltaY !== 0) {
              const deltaInRatio =
                imageController.zoomController.deltaScreenToCanvasRatio(
                  deltaX,
                  deltaY,
                );

              // deltaX and deltaY must be adjusted to fit the ratio
              const orientation = state.getValue(
                CROP_PREVIEW_STATE.ORIENTATION,
              );
              if (ratio !== 0) {
                const ratioValue =
                  orientation == Orientation.PAYSAGE ? ratio : 1 / ratio;
                let ratioseg1 = c.dir(ratioValue);
                let projected1 = new Vector(
                  deltaInRatio.x,
                  deltaInRatio.y,
                ).projectOnto(ratioseg1);
                const currentValue = state.getValue(CROP_PREVIEW_STATE.AREA);
                let newArea = c.updateAreaWithDelta(
                  currentValue,
                  projected1,
                  ratioValue,
                );
                state.setValue(CROP_PREVIEW_STATE.AREA, newArea);

                initialMousePosMove = currentPos;
              }
              return;
            }
          }
        });
    }

    state.events.on(CROP_PREVIEW_STATE.AREA, () => {
      const currentValue = state.getValue(CROP_PREVIEW_STATE.AREA);
      const inBounds =
        currentValue.left >= 0 &&
        currentValue.top >= 0 &&
        currentValue.right <= 1 &&
        currentValue.bottom <= 1;
      okControl.addRemoveClass("disabled", !inBounds);
    });
    const ratioUpdate = debounced(
      () => {
        let ratio = Ratios[state.getValue(CROP_PREVIEW_STATE.RATIO)];
        const orientation = state.getValue(CROP_PREVIEW_STATE.ORIENTATION);
        const currentValue = { ...state.getValue(CROP_PREVIEW_STATE.AREA) };
        // recalculate a good approximation based on the mode and current orientation
        if (ratio === 0) {
          let tmp = currentValue.right;
          currentValue.right = currentValue.bottom;
          currentValue.bottom = tmp;
          state.setValue(CROP_PREVIEW_STATE.AREA, currentValue);
          return;
        }
        let ratioValue = orientation == Orientation.PAYSAGE ? ratio : 1 / ratio;
        // Adjust the ratio with the picture ratio
        const imageRatio =
          imageController.zoomController.naturalDimensions().width /
          imageController.zoomController.naturalDimensions().height;

        ratioValue *= imageRatio;

        // Keep the same surface with the new ratio
        // and center the crop area
        const surface =
          (currentValue.right - currentValue.left) *
          (currentValue.bottom - currentValue.top);
        const newWidth = Math.sqrt(surface / ratioValue);
        const newHeight = newWidth * ratioValue;
        const center = {
          x: (currentValue.left + currentValue.right) / 2,
          y: (currentValue.top + currentValue.bottom) / 2,
        };
        currentValue.left = center.x - newWidth / 2;
        currentValue.right = center.x + newWidth / 2;
        currentValue.top = center.y - newHeight / 2;
        currentValue.bottom = center.y + newHeight / 2;
        // If the new ratio goes beyond the image, we need to adjust the crop area
        if (currentValue.right - currentValue.left > 1) {
          currentValue.right = 1;
          currentValue.left = 0;
          const newHeight = ratioValue;
          currentValue.top = center.y - newHeight / 2;
          currentValue.bottom = center.y + newHeight / 2;
        }
        if (currentValue.bottom - currentValue.top > 1) {
          currentValue.bottom = 1;
          currentValue.top = 0;
          const newWidth = 1 / ratioValue;
          currentValue.left = center.x - newWidth / 2;
          currentValue.right = center.x + newWidth / 2;
        }
        if (currentValue.left < 0) {
          currentValue.right -= currentValue.left;
          currentValue.left = 0;
        }
        if (currentValue.right > 1) {
          currentValue.left -= currentValue.right - 1;
          currentValue.right = 1;
        }
        if (currentValue.top < 0) {
          currentValue.bottom -= currentValue.top;
          currentValue.top = 0;
        }
        if (currentValue.bottom > 1) {
          currentValue.top -= currentValue.bottom - 1;
          currentValue.bottom = 1;
        }
        state.setValue(CROP_PREVIEW_STATE.AREA, currentValue);
      },
      50,
      false,
    );
    state.events.on(CROP_PREVIEW_STATE.RATIO, ratioUpdate);
    state.events.on(CROP_PREVIEW_STATE.ORIENTATION, ratioUpdate);

    const moveCornersFromValue = () => {
      const currentValue = state.getValue(CROP_PREVIEW_STATE.AREA);
      const topLeft = imageController.zoomController.ratioToScreen(
        currentValue.left,
        currentValue.top,
      );
      const bottomRight = imageController.zoomController.ratioToScreen(
        currentValue.right,
        currentValue.bottom,
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
    $<PicasaMultiButton>(".crop-orientation-control", toolControls)
      .get()
      .bind(
        state,
        CROP_PREVIEW_STATE.ORIENTATION,
        Object.values(OrientationList),
      );
    $<PicasaMultiButton>(".crop-ratio-control", toolControls)
      .get()
      .bind(state, CROP_PREVIEW_STATE.RATIO, Object.values(RatioList));
    if (state.getValue(CROP_PREVIEW_STATE.RATIO) === undefined) {
      state.setValue(CROP_PREVIEW_STATE.RATIO, "4x6");
    }
    if (state.getValue(CROP_PREVIEW_STATE.ORIENTATION) === undefined) {
      state.setValue(CROP_PREVIEW_STATE.ORIENTATION, Orientation.PAYSAGE);
    }

    moveCornersFromValue();
  });
}

function adjustCorners(
  area: RectArea,
  strategy: "ratio" | "slide",
  ratio: number,
) {
  if (strategy === "slide") {
    if (area.left < 0) {
      area.right -= area.left;
      area.left = 0;
    }
    if (area.top < 0) {
      area.bottom -= area.top;
      area.top = 0;
    }
    if (area.right > 1) {
      area.left -= area.right - 1;
      area.right = 1;
    }
    if (area.bottom > 1) {
      area.top -= area.bottom - 1;
      area.bottom = 1;
    }
  } else if (strategy === "ratio") {
    if (ratio === 0) {
      return area;
    }
    if (area.left < 0) {
      area.top -= area.left * ratio;
      area.left = 0;
    }
    if (area.top < 0) {
      area.left -= area.top / ratio;
      area.top = 0;
    }
    if (area.right > 1) {
      area.top += (area.right - 1) * ratio;
      area.right = 1;
    }
    if (area.bottom > 1) {
      area.left += (area.bottom - 1) / ratio;
      area.bottom = 1;
    }
  }
  return area;
}
