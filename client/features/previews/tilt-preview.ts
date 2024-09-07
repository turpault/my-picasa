import { Vector } from "ts-2d-geometry";
import { rotateRectangle } from "../../../shared/lib/geometry";
import { uuid } from "../../../shared/lib/utils";
import { ImageController } from "../../components/image-controller";
import { ToolEditor } from "../../components/tool-editor";
import { $ } from "../../lib/dom";
import { State } from "../../lib/state";
import { toolHTML } from "../baseTool";
import { t } from "../../components/strings";

export enum TILT_PREVIEW_STATE {
  ANGLE = "angle",
  ZOOM = "zoom",
}

export type TiltPreviewStateDef = {
  [TILT_PREVIEW_STATE.ANGLE]: number;
  [TILT_PREVIEW_STATE.ZOOM]: number;
};

export type TiltPreviewState = State<TiltPreviewStateDef>;

function sliderToValue(v: number) {
  const value = v;
  return value;
}

function valueToSlider(v: any) {
  v = parseFloat(v || "0");
  return v;
}

export type ValueChangeEvent = {
  updated: { index: number; value: number; origin: "preview" | "control" };
  preview: { index: number; value: number };
  cancel: {};
};

export function setupTiltPreview(
  toolEditor: ToolEditor,
  controller: ImageController,
  state: TiltPreviewState
) {
  const tiltAreaId = uuid();
  const overlay = $(`
  <div class="tilt fill">
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
<input is="picasa-slider" type="range" min="-1" max="1" value="0" class="tilt-tool-rotation slider">
</div>
`);
  return new Promise<boolean>((resolve) => {
    const ok = () => {
      toolEditor.deactivate();
      resolve(true);
    };
    const cancel = () => {
      toolEditor.deactivate();
      resolve(false);
    };
    const trash = () => {
      toolEditor.deactivate();
      resolve(null);
    };
    const controls = toolHTML(
      "Tilt",
      "Rotate the image",
      "resources/images/icons/tilt.png",
      ok,
      cancel,
      trash
    );
    toolEditor.activate(controls.toolElement, overlay);

    if (state.getValue(TILT_PREVIEW_STATE.ANGLE) === undefined) {
      state.setValue(TILT_PREVIEW_STATE.ANGLE, 0);
    }
    if (state.getValue(TILT_PREVIEW_STATE.ZOOM) === undefined) {
      state.setValue(TILT_PREVIEW_STATE.ZOOM, 0);
    }

    $(".tilt-tool-rotation", overlay).on("input", function () {
      state.setValue(TILT_PREVIEW_STATE.ANGLE, sliderToValue(this.val()));
    });
    state.events.on(TILT_PREVIEW_STATE.ANGLE, updatePreview);
    updatePreview(state.getValue(TILT_PREVIEW_STATE.ANGLE));

    async function updatePreview(value: number) {
      $(".tilt-tool-rotation", overlay).val(valueToSlider(value));
      await controller.zoomController.rotate(value * 10); // value is [-1, 1]
      // Calculate the cropped area
      const rectArea = controller.zoomController.canvasBoundsOnScreen();
      const rect = rectArea.bottomRight.minus(rectArea.topLeft);
      const rotatedData = rotateRectangle(
        rect.x,
        rect.y,
        (value * 10 * Math.PI) / 180
      );
      const xOffset = (rect.x - rect.x / rotatedData.ratio) / 2;
      const yOffset = (rect.y - rect.y / rotatedData.ratio) / 2;
      const targetTopLeft = rectArea.topLeft.plus(new Vector(xOffset, yOffset));
      const targetBottomRight = rectArea.bottomRight.plus(
        new Vector(-xOffset, -yOffset)
      );

      $(`#${tiltAreaId}`).attr({
        x: targetTopLeft.x,
        y: targetTopLeft.y,
        width: targetBottomRight.x - targetTopLeft.x,
        height: targetBottomRight.y - targetTopLeft.y,
      });
    }
  });
}
