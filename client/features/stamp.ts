import { buildEmitter } from "../../shared/lib/event";
import { isPicture } from "../../shared/lib/utils";
import { ImageController } from "../components/image-controller";
import { t } from "../components/strings";
import { GENERAL_TOOL_TAB, ToolRegistrar } from "../components/tools";
import { toolHeader } from "../element-templates";
import { transform } from "../imageProcess/client";
import { $, _$ } from "../lib/dom";
import { ImagePanZoomController } from "../lib/panzoom";
import {
  setupStampPreview,
  StampParameters,
  ValueChangeEvent,
} from "./previews/stamp-preview";

function sliderToValue(v: number | string) {
  const value = parseFloat(v.toString()) / 100;
  return value;
}

function valueToSlider(v: any) {
  v = parseFloat(v || "0");
  return v * 100;
}

export function setupStamp(
  container: _$,
  panZoomCtrl: ImagePanZoomController,
  imageCtrl: ImageController,
  toolRegistrar: ToolRegistrar
) {
  const name = t("Stamp");
  let activeIndex: number = -1;
  let _deactivate: ((commit: boolean) => void) | undefined;
  const emitter = buildEmitter<ValueChangeEvent>();

  let removePreview: Function | undefined;
  function show(index: number, initialValue: StampParameters) {
    activeIndex = index;
    panZoomCtrl.recenter();
    panZoomCtrl.enable(false);
    removePreview = setupStampPreview(
      container,
      initialValue,
      activeIndex,
      emitter,
      panZoomCtrl
    );
  }

  function hide(commit: boolean) {
    activeIndex = -1;
    panZoomCtrl.enable(true);
    if (removePreview) {
      removePreview();
      if (_deactivate) {
        _deactivate(commit);
        _deactivate = undefined;
      }
    }
  }
  emitter.on("cancel", () => {
    hide(false);
  });

  toolRegistrar.registerTool(name, GENERAL_TOOL_TAB, {
    multipleFamily: null,
    filterName: "stamp",
    enable: (e) => isPicture(e),
    icon: async function (context) {
      // Stamp 45
      await transform(context, [this.build()]);
      return true;
    },
    editable: true,
    activate: async function (index: number, args?: string[]) {
      let initialValue = args ? JSON.parse(args[1]) : 0;
      if (!args) {
        imageCtrl.addOperation(this.build(initialValue, 0));
      }
      show(index, initialValue);
      return new Promise<boolean>((resolve) => {
        _deactivate = resolve;
      });
    },
    build: function (angle: number = 0.1, zoom: number = 0) {
      return {
        name: this.filterName,
        args: ["1", angle.toString(), zoom.toString()],
      };
    },
    buildUI: function (index: number, args: string[]) {
      const e = toolHeader(name, index, imageCtrl, toolRegistrar, this);
      e.append(`<div>
      </div>`);
      return {
        ui: e.get()!,
        clearFcts: () => {},
      };
    },
  });
}
