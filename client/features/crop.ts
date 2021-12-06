import { ImageController } from "../components/image-controller.js";
import { ToolRegistrar } from "../components/tools.js";
import { toolHeader } from "../element-templates.js";
import { transform } from "../imageProcess/client.js";
import { ImagePanZoomController } from "../lib/panzoom.js";
import { encodeRect, isPicture } from "../../shared/lib/utils.js";
import { $ } from "../lib/dom.js";

function projectedPoint(
  p: { x: number; y: number },
  line: { origin: { x: number; y: number }; m: number }
): { x: number; y: number } {
  const poff = { x: p.x - line.origin.x, y: p.y - line.origin.y };
  const y =
    (line.m * line.m * poff.y + line.m * poff.x) / (1 + line.m * line.m);
  const x = y / line.m;
  return { x: x + line.origin.x, y: y + line.origin.y };
}

function sqDistanceBetween(
  p1: { x: number; y: number },
  p2: { x: number; y: number }
) {
  return Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2);
}
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
  $(container).append(elem);

  const tl = $(".crop-top-left", elem);
  const tr = $(".crop-top-right", elem);
  const bl = $(".crop-bottom-left", elem);
  const br = $(".crop-bottom-right", elem);

  const e = elem.get() as HTMLElement;

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
  let l: number, r: number, t: number, b: number;
  let w: number, h: number;
  e.style.display = "none";

  /*tl.on("mousemove", (ev) => {
    if (ev.buttons === 1) {
      const mouseCoordinates = { x: ev.clientX, y: ev.clientY };
      const p1 = projectedPoint(mouseCoordinates, {
        origin: { x: l, y: t },
        m: ratios[mode],
      });
      const p2 = projectedPoint(mouseCoordinates, {
        origin: { x: l, y: t },
        m: 1 / ratios[mode],
      });
      const d1 = sqDistanceBetween(p1, mouseCoordinates);
      const d2 = sqDistanceBetween(p1, mouseCoordinates);
      let selectedPoint = p1;
      if (d1 > d2) {
        selectedPoint = p2;
      }
      tl.css({
        left: `${selectedPoint.x}px`,
        top: `${selectedPoint.y}px`,
      });
    }
  });*/
  tr.on("pointerdown", (ev) => {
    console.info("Down");
    tr.get().setPointerCapture(ev.pointerId);
  })
    .on("pointerup", (ev) => {
      console.info("Up");
      tr.get().releasePointerCapture(ev.pointerId);
    })
    .on(
      "pointermove",
      (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        if (ev.buttons === 1) {
          const mouseInContainerCoordinates = {
            x: ev.clientX - container.offsetLeft,
            y: ev.clientY - container.offsetTop,
          };
          // Coordinates are based on the tr corner
          const mouseCoordinates = {
            x: container.clientWidth - mouseInContainerCoordinates.x,
            y: mouseInContainerCoordinates.y,
          };
          const p1 = projectedPoint(mouseCoordinates, {
            origin: { x: r, y: t },
            m: ratios[mode],
          });
          const p2 = projectedPoint(mouseCoordinates, {
            origin: { x: r, y: t },
            m: 1 / ratios[mode],
          });
          console.info("Move", mouseCoordinates);
          console.info("Projected", p1);
          const d1 = sqDistanceBetween(p1, mouseCoordinates);
          const d2 = sqDistanceBetween(p2, mouseCoordinates);
          let selectedPoint = p1;
          if (d1 > d2) {
            selectedPoint = p2;
          }
          elem.css({
            right: `${selectedPoint.x}px`,
            top: `${selectedPoint.y}px`,
          });
        }
      },
      false
    );
  function validate() {
    const topLeft = panZoomCtrl.screenToCanvasCoords(l, t);
    const bottomRight = panZoomCtrl.screenToCanvasCoords(w - r, h - b);
    const inBounds =
      panZoomCtrl.inBounds(topLeft) && panZoomCtrl.inBounds(bottomRight);
    ok.addRemoveClass("disabled", !inBounds);
    ok.addRemoveClass("w3-red", !inBounds);
  }

  function resize() {
    h = e.parentElement!.clientHeight;
    w = e.parentElement!.clientWidth;
    const offsetL = e.parentElement!.offsetLeft;
    const offsetT = e.parentElement!.offsetTop;
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

    e.style.left = `${l}px`;
    e.style.right = `${r}px`;
    e.style.top = `${t}px`;
    e.style.bottom = `${b}px`;
    validate();
  }
  new ResizeObserver(resize).observe(e.parentElement!);

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
    const topLeft = panZoomCtrl.screenToCanvasRatio(l, t);
    const bottomRight = panZoomCtrl.screenToCanvasRatio(w - r, h - b);
    imageCtrl.addOperation(
      toolRegistrar
        .tool(name)
        .build(topLeft.x, topLeft.y, bottomRight.x, bottomRight.y)
    );
    e.style.display = "none";
  });
  cancel.on("click", () => {
    e.style.display = "none";
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
      e.style.display = "block";
      validate();
      return true;
    },
    build: function (left: number, top: number, right: number, bottom: number) {
      return `${this.filterName}=1,${encodeRect({ left, top, right, bottom })}`;
    },
    buildUI: function (index: number, args: string[]) {
      const e = toolHeader(name, index, imageCtrl);
      return e.get()!;
    },
  });
}
