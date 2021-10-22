import { buildEmitter, Emitter } from "../lib/event.js";
import { jBone as $ } from "../lib/jbone/jbone.js";
import { ImagePanZoomController } from "../lib/panzoom.js";
import { CropToolEvent, ImageControllerEvent } from "../types/types.js";

export function make(
  e: HTMLElement,
  ctrl: ImagePanZoomController,
  operationRequestEvent: Emitter<ImageControllerEvent>
): Emitter<CropToolEvent> {
  type modes = "4x3" | "16x9" | "5x5";
  let mode: modes = "4x3";
  let orientation: "paysage" | "portrait" = "paysage";
  let l: number, r: number, t: number, b: number;
  let w: number, h: number;
  e.style.display = "none";
  const emitter = buildEmitter<CropToolEvent>();

  function validate() {
    const topLeft = ctrl.screenToCanvasCoords(l, t);
    const bottomRight = ctrl.screenToCanvasCoords(w - r, h - b);
    const inBounds = ctrl.inBounds(topLeft) && ctrl.inBounds(bottomRight);
    ok.toggleClass("disabled", !inBounds);
    ok.toggleClass("w3-red", !inBounds);
  }

  function resize() {
    h = window.innerHeight;
    w = window.innerWidth;
    const ratios: {
      [key: string]: number;
    } = {
      "4x3": 4 / 3,
      "16x9": 16 / 9,
      "5x5": 1,
    };
    const winRatio = w / h;
    let cropRatio;
    if (orientation === "paysage") {
      cropRatio = ratios[mode];
    } else {
      cropRatio = 1 / ratios[mode];
    }
    if (winRatio < cropRatio) {
      // constraint by width
      l = w * 0.1;
      r = l;
      t = (h - (w * 0.8) / cropRatio) / 2;
      b = t;
    } else {
      t = h * 0.1;
      b = t;
      l = (w - h * 0.8 * cropRatio) / 2;
      r = l;
    }

    e.style.left = `${l}px`;
    e.style.right = `${r}px`;
    e.style.top = `${t}px`;
    e.style.bottom = `${b}px`;
    validate();
  }
  $(window).on("resize", (e: Event) => {
    resize();
  });
  $("#btn-4x3").on("click", () => {
    mode = "4x3";
    resize();
  });
  $("#btn-16x9").on("click", () => {
    mode = "16x9";
    resize();
  });
  $("#btn-5x5").on("click", () => {
    mode = "5x5";
    resize();
  });
  const ok = $("#btn-ok-crop");
  const cancel = $("#btn-cancel-crop");
  ctrl.events.on("pan", validate);
  ctrl.events.on("zoom", validate);

  $("#btn-orientation").on("click", () => {
    orientation = orientation === "portrait" ? "paysage" : "portrait";
    resize();
  });
  ok.on("click", () => {
    //e.style.display = "none";
    const topLeft = ctrl.screenToCanvasCoords(l, t);
    const bottomRight = ctrl.screenToCanvasCoords(w - r, h - b);
    emitter.emit("cropped", { topLeft, bottomRight });
    e.style.display = "none";
  });
  cancel.on("click", () => {
    e.style.display = "none";
  });
  $("#btn-crop").on("click", () => {
    e.style.display = "block";
    validate();
  });
  operationRequestEvent.on("cropEdit", () => {
    e.style.display = "block";
    validate();
  });
  resize();
  return emitter;
}
