import { PanZoomController } from "panzoom";
import { Line, LineSegment, Point, Rectangle, Vector } from "ts-2d-geometry";
import { Emitter, buildEmitter } from "../../../shared/lib/event";
import { RectArea } from "../../../shared/lib/utils";
import { $, _$ } from "../../lib/dom";
import { ImagePanZoomController } from "../../lib/panzoom";
import { DraggableControlPositionEvent } from "../../uiTypes";
import { stamp } from "leaflet";

export type ValueChangeEvent = {
  updated: { index: number; value: StampParameters };
  preview: { index: number; value: StampParameters };
  cancel: {};
};

export function draggableElement(
  elem: _$,
  panZoomCtrl: ImagePanZoomController
): Emitter<DraggableControlPositionEvent> {
  const emitter = buildEmitter<DraggableControlPositionEvent>();
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
      if (initialMousePosMove) {
        const imageCoords = panZoomCtrl.screenToCanvasCoords(
          ev.clientX,
          ev.clientY
        );
        emitter.emit("dragged", {
          canvasPosition: imageCoords,
          screenPosition: { x: ev.clientX, y: ev.clientY },
        });
      }
    });
  return emitter;
}
export type StampParameters = {
  sourceX: number;
  sourceY: number;
  sourceRadius: number;
  targetX: number;
  targetY: number;
};

export function setupStampPreview(
  container: _$,
  currentValue: StampParameters,
  activeIndex: number,
  emitter: Emitter<ValueChangeEvent>,
  panZoomCtrl: ImagePanZoomController
): Function {
  const elem = $(`<div class="stamp hidden">
    <div draggable class="stamp-source">
    <div draggable class="stamp-source-bottom-right"></div>
  </div>
  <div draggable class="stamp-destination"/>
  </div>`);
  const draw = $('<div class="draw hidden"></div>');
  $(container).append(elem);
  $(container).append(draw);
  const stampSource = $(".stamp-source", elem);
  const stampResizer = $(".stamp-source-bottom-right", elem);
  const stampDestination = $(".stamp-destination", elem);

  draggableElement(stampSource, panZoomCtrl).on("dragged", (ev) => {
    updateStampSource(ev.canvasPosition);
  });
  draggableElement(stampResizer, panZoomCtrl).on("dragged", (ev) => {
    // Todo project the point to the diagonal of the stamp source
  });
  draggableElement(stampDestination, panZoomCtrl).on("dragged", (ev) => {
    updateStampDestination(ev.canvasPosition);
  });

  const placeFromValue = (value: StampParameters) => {
    stampSource.absolutePosition(
      panZoomCtrl.canvasToScreenCoords(value.sourceX, value.sourceY)
    );
    stampResizer.absolutePosition(
      panZoomCtrl.canvasToScreenCoords(value.targetX, value.targetY)
    );
  };

  const updateStampSource = (pos: { x: number; y: number }) => {
    currentValue.sourceX = pos.x;
    currentValue.sourceY = pos.y;
    emitter.emit("updated", {
      index: activeIndex,
      value: currentValue,
    });
  };

  const updateStampDestination = (pos: { x: number; y: number }) => {
    currentValue.targetX = pos.x;
    currentValue.targetY = pos.y;
    emitter.emit("updated", {
      index: activeIndex,
      value: currentValue,
    });
  };
  placeFromValue(currentValue);

  return () => {
    elem.remove();
    draw.remove();
  };
}
