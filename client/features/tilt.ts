import { buildEmitter } from "../../shared/lib/event";
import { isPicture } from "../../shared/lib/utils";
import { ImageController } from "../components/image-controller";
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
  panZoomCtrl: ImagePanZoomController,
  imageCtrl: ImageController,
  toolRegistrar: ToolRegistrar
) {
  const name = "Tilt";
  let activeIndex: number = -1;
  let _deactivate: ((commit: boolean) => void) | undefined;
  const emitter = buildEmitter<ValueChangeEvent>();

  const preview = setupTiltPreview(container, emitter, panZoomCtrl);

  function show(index: number, initialValue: number) {
    activeIndex = index;
    panZoomCtrl.recenter();
    panZoomCtrl.enable(false);
    preview.show(activeIndex, initialValue);
    //console.info('Setting value', valueToSlider(initialValue));
    //$(".rotation", container).val(valueToSlider(initialValue));
  }

  function hide(commit: boolean) {
    activeIndex = -1;
    panZoomCtrl.enable(true);
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
    multiple: false,
    filterName: "tilt",
    enable: (e) => isPicture(e),
    icon: async function (context) {
      // Tilt 45
      await transform(context, this.build(0.1, 0));
      return true;
    },
    editable: true,
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
      $(".rotation", e).val(valueToSlider(args[1]));
      const clearFcts: Function[] = [];
      clearFcts.push(emitter.on("updated", (event) => {
        if (index === event.index) {

          if (event.origin !== 'control') {
            console.info('Setting value', valueToSlider(event.value));
            $(".rotation", e).val(valueToSlider(event.value));
          }
          imageCtrl.updateOperation(index, this.build(event.value, 0));
          hide(true);
        }
      }));
      clearFcts.push(emitter.on("preview", (event) => {
        if (index === event.index) {
          console.info('Setting value', valueToSlider(event.value));
          $(".rotation", e).val(valueToSlider(event.value));
        }
      }));
      $(".rotation", e).on("change", function () {
        if (activeIndex === index) {
          emitter.emit("preview", { index, value: sliderToValue(this.val()) });
        } else {
          emitter.emit("updated", { index, value: sliderToValue(this.val()), origin: 'control' });
        }
      });
      return { ui: e.get()!, clearFcts: () => { clearFcts.forEach(f => f()) } };
    },
  });
}
