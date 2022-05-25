import { Vector } from "ts-2d-geometry";
import { Emitter } from "../../../shared/lib/event";
import { rotateRectangle } from "../../../shared/lib/geometry";
import { uuid } from "../../../shared/lib/utils";
import { $, _$ } from "../../lib/dom";
import { ImagePanZoomController } from "../../lib/panzoom";

function sliderToValue(v: number) {
  const value = v / 100;
  return value;
}

function valueToSlider(v: any) {
  v = parseFloat(v || "0");
  return v * 100;
}

export type ValueChangeEvent = {
  updated: { index: number; value: number };
  preview: { index: number; value: number };
  cancel: {}
};

export function setupTiltPreview(container: _$, emitter: Emitter<ValueChangeEvent>, panZoomCtrl: ImagePanZoomController)
{  
  const tiltAreaId = uuid();
  const elem = $(`<div class="tilt fill" style="display: none">
  <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <pattern id="smallGrid" width="8" height="8" patternUnits="userSpaceOnUse">
      <path d="M 8 0 L 0 0 0 8" fill="none" stroke="gray" stroke-width="0.5"/>
    </pattern>
    <pattern id="grid" width="80" height="80" patternUnits="userSpaceOnUse">
      <rect width="80" height="80" fill="url(#smallGrid)"/>
      <path d="M 80 0 L 0 0 0 80" fill="none" stroke="gray" stroke-width="1"/>
    </pattern>
  </defs>
      
  <rect width="100%" height="100%" fill="url(#grid)" />
  <rect id="${tiltAreaId}" x="0" y="0" width="0" height="0" style="fill: transparent; stroke:red; stroke-width:5" />
</svg>
  <div class="rotation-tool-inner-control slidecontainer">
  <label>Rotation</label>
  <input type="range" min="-100" max="100" value="0" class="rotation slider">
  <div class="tilt-accept-buttons">
    <button class="btn-ok-tilt w3-button w3-bar-item override-pointer-active">
      <i class="fa fa-check-circle"></i>
    </button>
    <button class="btn-cancel-tilt w3-button w3-bar-item override-pointer-active">
      <i class="fa fa-times"></i>
    </button>
  </div>
</div>
</div>`);

  container.append(elem);
  let activeIndex: number = -1;
  $(".rotation", container).on("input", function () {
    emitter.emit("preview", {
      index: activeIndex,
      value: sliderToValue(this.val()),
    });
  });
  $(".btn-ok-tilt", container).on("click", function () {
    emitter.emit("updated", {
      index: activeIndex,
      value: sliderToValue($(".rotation", container).val()),
    });
  });
  $(".btn-cancel-tilt", container).on("click", function () {
    emitter.emit('cancel', {});
  });

  function updatePreview(value: number) {
    $(".rotation", container).val(valueToSlider(value));
    panZoomCtrl.rotate(value * 10); // value is [-1, 1]
    // Calculate the cropped area
    const rectArea = panZoomCtrl.canvasBoundsOnScreen();
    const rect = rectArea.bottomRight.minus(rectArea.topLeft);
    const rotatedData = rotateRectangle(rect.x, rect.y, value * 10 * Math.PI / 180 );
    const xOffset = (rect.x - rect.x / rotatedData.ratio) / 2;
    const yOffset = (rect.y - rect.y / rotatedData.ratio) / 2;
    const targetTopLeft = rectArea.topLeft.plus(new Vector(xOffset, yOffset));
    const targetBottomRight = rectArea.bottomRight.plus(new Vector(-xOffset, -yOffset));

    $(`#${tiltAreaId}`).attr({
      x: targetTopLeft.x,
      y: targetTopLeft.y,
      width: targetBottomRight.x - targetTopLeft.x,
      height: targetBottomRight.y - targetTopLeft.y
    });
  }
  emitter.on("preview", (event) => {
    if (event.index === activeIndex) {
      updatePreview(event.value);
    }
  });
  return {
    show: (index:number , initialValue: number)=> {
      updatePreview(initialValue);
      activeIndex = index;
      elem.css({ display: "block" });
    },
    hide: ()=> {
      elem.css({ display: "none" });
    }
  }
}