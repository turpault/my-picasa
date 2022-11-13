import { decodeRect, encodeRect, isPicture, RectRange } from "../../shared/lib/utils";
import { ImageController } from "../components/image-controller";
import { GENERAL_TOOL_TAB, ToolRegistrar } from "../components/tools";
import { toolHeader } from "../element-templates";
import { transform } from "../imageProcess/client";
import { $, _$ } from "../lib/dom";
import { buildEmitter } from "../../shared/lib/event";
import { ImagePanZoomController } from "../lib/panzoom";
import { setupCropPreview, ValueChangeEvent } from "./previews/crop-preview";

export function setupCrop(
  container: _$,
  panZoomCtrl: ImagePanZoomController,
  imageController: ImageController,
  toolRegistrar: ToolRegistrar
) {
  const name = "Crop";

  const emitter = buildEmitter<ValueChangeEvent>();
  const preview = setupCropPreview(container, emitter, panZoomCtrl);

  let activeIndex: number = -1;
  let _deactivate: ((commit: boolean) => void) | undefined;

  function show(index: number, initialValue: RectRange) {
    activeIndex = index;
    panZoomCtrl.recenter();
    panZoomCtrl.enable(false);
    preview.show(activeIndex, initialValue);
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
    multipleFamily: null,
    filterName: "crop64",
    enable: (e) => isPicture(e),
    icon: async function (context) {
      // Crop at 50%
      await transform(context, [this.build(0.25, 0.25, 0.75, 0.75)]);
      return true;
    },
    editable: true,
    activate: async function (index: number, args?: string[]) {
      let initialValue = args ? decodeRect(args[1]) : { left: 0.1, right: 0.9, top: 0.1, bottom: 0.9 };
      if (!args) {
        imageController.addOperation(this.build(initialValue));
      }
      show(index, initialValue);

      return new Promise<boolean>((resolve) => {
        _deactivate = resolve;
      });
    },
    build: function (rect: { left: number, top: number, right: number, bottom: number }) {
      return {
        name: this.filterName,
        args:['1', encodeRect(rect)]
      }
    },
    buildUI: function (index: number, args: string[]) {
      const e = toolHeader(name, index, imageController, toolRegistrar);
      e.append(`<div>
        <div class="tool-control slidecontainer">
          <label>Left</label>
          <input type="range" min="0" max="100" value="0" class="crop-left slider">
        </div>
        <div class="tool-control slidecontainer">
          <label>Right</label>
          <input type="range" min="0" max="100" value="0" class="crop-right slider">
        </div>
        <div class="tool-control slidecontainer">
          <label>Top</label>
          <input type="range" min="0" max="100" value="0" class="crop-top slider">
        </div>
        <div class="tool-control slidecontainer">
          <label>Bottom</label>
          <input type="range" min="0" max="100" value="0" class="crop-bottom slider">
        </div>
      </div>`);
      const clearFcts: Function[] = [];
      clearFcts.push(emitter.on("updated", (event) => {
        if (index === event.index) {
          $(".crop-left", e).val(event.value.left * 100);
          $(".crop-right", e).val(event.value.right * 100);
          $(".crop-top", e).val(event.value.top * 100);
          $(".crop-bottom", e).val(event.value.bottom * 100);
          imageController.updateOperation(index, this.build(event.value, 0));
          hide(true);
        }
      }));
      clearFcts.push(emitter.on("preview", (event) => {
        if (index === event.index) {
          $(".crop-left", e).val(event.value.left * 100);
          $(".crop-right", e).val(event.value.right * 100);
          $(".crop-top", e).val(event.value.top * 100);
          $(".crop-bottom", e).val(event.value.bottom * 100);
        }
      }));
      function rectFromControls() {
        return {
          left: $(".crop-left", e).val() / 100,
          right: $(".crop-right", e).val() / 100,
          top: $(".crop-top", e).val() / 100,
          bottom: $(".crop-bottom", e).val() / 100,
        }
      }
      function controlsChanged() {
        if (activeIndex === index) {
          emitter.emit("preview", { index, value: rectFromControls() });
        } else {
          emitter.emit("updated", { index, value: rectFromControls() });
        }
      }
      const decoded = decodeRect(args[1]);
      $(".crop-left", e).on("change", controlsChanged).val(decoded.left * 100);
      $(".crop-right", e).on("change", controlsChanged).val(decoded.right * 100);
      $(".crop-top", e).on("change", controlsChanged).val(decoded.top * 100);
      $(".crop-bottom", e).on("change", controlsChanged).val(decoded.bottom * 100);
      return { ui: e.get()!, clearFcts: () => { clearFcts.forEach(f => f()) } };
    },
  });
}
