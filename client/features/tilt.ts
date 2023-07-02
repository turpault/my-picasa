import { buildEmitter } from "../../shared/lib/event";
import { isPicture } from "../../shared/lib/utils";
import { ImageController } from "../components/image-controller";
import { t } from "../components/strings";
import { GENERAL_TOOL_TAB, ToolRegistrar } from "../components/tools";
import { toolHeader } from "../element-templates";
import { transform } from "../imageProcess/client";
import { $, _$ } from "../lib/dom";
import { ImagePanZoomController } from "../lib/panzoom";
import { setupTiltPreview, ValueChangeEvent } from "./previews/tilt-preview";

function sliderToValue(v: number | string) {
  const value = parseFloat(v.toString()) / 100;
  return value;
}

function valueToSlider(v: any) {
  v = parseFloat(v || "0");
  return v * 100;
}

export function setupTilt(
  container: _$,
  imageCtrl: ImageController,
  toolRegistrar: ToolRegistrar
) {
  const name = t("Tilt");
  let activeIndex: number = -1;
  let _deactivate: ((commit: boolean) => void) | undefined;
  const emitter = buildEmitter<ValueChangeEvent>();

  const preview = setupTiltPreview(container, emitter, imageCtrl);

  async function show(index: number, initialValue: number) {
    activeIndex = index;
    await imageCtrl.recenter();
    await imageCtrl.enableZoom(false);
    preview.show(activeIndex, initialValue);
  }

  async function hide(commit: boolean) {
    activeIndex = -1;
    await imageCtrl.enableZoom(true);
    preview.hide();
    if (_deactivate) {
      _deactivate(commit);
      _deactivate = undefined;
    }
  }
  emitter.on("cancel", () => {
    hide(false);
  });

  toolRegistrar.registerTool(name, GENERAL_TOOL_TAB, {
    multipleFamily: null,
    permanentIndex: 2,
    filterName: "tilt",
    enable: (e) => isPicture(e),
    icon: async function (context) {
      // Tilt 45
      await transform(context, [this.build()]);
      return true;
    },
    editable: true,
    reset: async function (index: number) {
      imageCtrl.updateOperation(index, this.build());
    },
    activate: async function (index: number, args?: string[]) {
      let initialValue = args ? parseFloat(args[1]) : 0;
      if (!args) {
        imageCtrl.addOperation(this.build(initialValue, 0));
      }
      show(index, initialValue);
      return new Promise<boolean>((resolve) => {
        _deactivate = resolve;
      });
    },
    build: function (angle: number = 0, zoom: number = 0) {
      return {
        name: this.filterName,
        args: ["1", angle.toString(), zoom.toString()],
      };
    },
    buildUI: function (index: number, args: string[]) {
      const e = toolHeader(name, index, imageCtrl, toolRegistrar, this);
      const clearFcts: Function[] = [];
      clearFcts.push(
        emitter.on("updated", (event) => {
          if (index === event.index) {
            if (event.origin !== "control") {
              console.info("Setting value", valueToSlider(event.value));
            }
            imageCtrl.updateOperation(index, this.build(event.value, 0));
            hide(true);
          }
        })
      );
      clearFcts.push(
        emitter.on("preview", (event) => {
          if (index === event.index) {
            console.info("Setting value", valueToSlider(event.value));
          }
        })
      );
      return {
        ui: e.get()!,
        clearFcts: () => {
          clearFcts.forEach((f) => f());
        },
      };
    },
  });
}
