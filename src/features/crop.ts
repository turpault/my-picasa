import { ImageController } from "../components/image-controller.js";
import { ToolRegistrar } from "../components/tools.js";
import { transform } from "../imageProcess/client.js";
import { jBone as $ } from "../lib/jbone/jbone.js";
import { ImagePanZoomController } from "../lib/panzoom.js";
import { encodeRect } from "../lib/utils.js";

export function setupCrop(
  panZoomCtrl: ImagePanZoomController,
  imageCtrl: ImageController,
  toolRegistrar: ToolRegistrar
) {
  const name = "Crop";
  const e = $("#crop")[0];

  type modes = "6x4" | "4x3" | "16x9" | "5x5";
  let mode: modes = "4x3";
  let orientation: "paysage" | "portrait" = "paysage";
  let l: number, r: number, t: number, b: number;
  let w: number, h: number;
  e.style.display = "none";

  function validate() {
    const topLeft = panZoomCtrl.screenToCanvasCoords(l, t);
    const bottomRight = panZoomCtrl.screenToCanvasCoords(w - r, h - b);
    const inBounds =
      panZoomCtrl.inBounds(topLeft) && panZoomCtrl.inBounds(bottomRight);
    ok.toggleClass("disabled", !inBounds);
    ok.toggleClass("w3-red", !inBounds);
  }

  function resize() {
    h = window.innerHeight;
    w = window.innerWidth;
    const ratios: {
      [key: string]: number;
    } = {
      "6x4": 6 / 4,
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
  $("#btn-6x4").on("click", () => {
    mode = "6x4";
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
  panZoomCtrl.events.on("pan", validate);
  panZoomCtrl.events.on("zoom", validate);

  $("#btn-orientation").on("click", () => {
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
      const e = $(`<li class="w3-display-container">${name}
      <span class="w3-button w3-display-right">&times;</span>
    </li>`);
      $("span", e).on("click", () => {
        imageCtrl.deleteOperation(index);
      });
      return e[0];
    },
  });
}
