import { ImageController } from "../components/image-controller";
import { ToolRegistrar } from "../components/tools";
import { toolHeader } from "../element-templates";
import { transform } from "../imageProcess/client";
import { $, _$ } from "../lib/dom";
import { isPicture, uuid } from "../../shared/lib/utils";
import { ImagePanZoomController } from "../lib/panzoom";
import { buildEmitter } from "../../shared/lib/event";
import { rotateRectangle } from "../../shared/lib/geometry";
import { Vector } from "ts-2d-geometry";

function sliderToValue(v: number) {
  const angleInDegrees = v / 10;
  const angleInRads = (Math.PI * angleInDegrees) / 180;
  return angleInRads;
}

function valueToSlider(v: any) {
  v = parseFloat(v || "0");
  const angleInDegrees = (v / Math.PI) * 180;
  return (angleInDegrees * 100) / 180;
}

export function setupTilt(
  container: _$,
  panZoomCtrl: ImagePanZoomController,
  imageCtrl: ImageController,
  toolRegistrar: ToolRegistrar
) {
  const name = "Tilt";
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
  <rect id="${tiltAreaId}" x="0" y="0" width="0" height="0" style="stroke:red;stroke-width:5" />
</svg>
  <div class="rotation-tool-inner-control slidecontainer">
  <label>Rotation</label>
  <input type="range" min="-100" max="100" value="0" class="rotation slider">
  </div>
</div>`);

  type ValueChangeEvent = {
    updated: { index: number; value: number };
  };
  container.append(elem);
  const emitter = buildEmitter<ValueChangeEvent>();
  let activeIndex: number;
  $(".rotation", container).on("change", function () {
    emitter.emit("updated", {
      index: activeIndex,
      value: sliderToValue(this.val()),
    });
  });
  emitter.on("updated", (event) => {
    if (event.index === activeIndex) {
      $(".rotation", container).val(valueToSlider(event.value));
      // Calculate the cropped area
      const rectArea = panZoomCtrl.canvasBoundsOnScreen();
      const rect = rectArea.bottomRight.minus(rectArea.topLeft);
      const rotatedData = rotateRectangle(rect.x, rect.y, event.value);
      const xOffset = rect.x / rotatedData.ratio / 2;
      const yOffset = rect.y / rotatedData.ratio / 2;
      const targetTopLeft = rectArea.topLeft.plus(new Vector(xOffset, yOffset));
      const targetBottomRight = rectArea.bottomRight.plus(new Vector(-xOffset, -yOffset));

      $(`#${tiltAreaId}`).attr({
        left: targetTopLeft.x,
        top: targetTopLeft.y,
        width: targetBottomRight.x - targetTopLeft.x,
        height: targetBottomRight.y - targetTopLeft.y
      });
    }
  });

  function show(index: number, initialValue: number) {
    activeIndex = index;
    panZoomCtrl.recenter();
    panZoomCtrl.enable(false);
    elem.css({ display: "block" });
    $(".rotation", container).val(valueToSlider(initialValue));
  }

  toolRegistrar.registerTool(name, {
    filterName: "tilt",
    enable: (e) => isPicture(e),
    icon: async function (context) {
      // Tilt 45
      await transform(context, this.build(Math.PI / 4, 0));
      return true;
    },
    activate: async function (index: number, args?: string[]) {
      let initialValue = args ? parseFloat(args[1]) : 0;
      if (!args) {
        imageCtrl.addOperation(this.build(initialValue, 0));
      }
      show(index, initialValue);
      return true;
    },
    build: function (angle: number, zoom: number) {
      return `${this.filterName}=1,${angle},${zoom})}`;
    },
    buildUI: function (index: number, args: string[]) {
      const e = toolHeader(name, index, imageCtrl, toolRegistrar);
      e.append(`<div>
        <div class="tool-control>
          <label>Show/Hide Grid</label>
          <input type="checkbox">
        </div>
        <div class="tool-control slidecontainer">
          <label>Rotation</label>
          <input type="range" min="-100" max="100" value="0" class="rotation slider">
        </div>
      </div>`);
      emitter.on("updated", (event) => {
        if (index === event.index) {
          $(".rotation", e).val(valueToSlider(event.value));
          imageCtrl.updateOperation(index, this.build(event.value, 0));
        }
      });
      $(".rotation", e).on("change", function () {
        emitter.emit("updated", { index, value: sliderToValue(this.val()) });
      });
      return e.get()!;
    },
  });
}
