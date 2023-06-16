import {
  decodeRect,
  encodeRect,
  isPicture,
  RectRange,
} from "../../shared/lib/utils";
import { ImageController } from "../components/image-controller";
import { GENERAL_TOOL_TAB, ToolRegistrar } from "../components/tools";
import { toolHeader } from "../element-templates";
import { transform } from "../imageProcess/client";
import { $, _$ } from "../lib/dom";
import { buildEmitter } from "../../shared/lib/event";
import { ImagePanZoomController } from "../lib/panzoom";
import { setupCropPreview, ValueChangeEvent } from "./previews/crop-preview";
import { t } from "../components/strings";

export function setupCrop(
  container: _$,
  panZoomCtrl: ImagePanZoomController,
  imageController: ImageController,
  toolRegistrar: ToolRegistrar
) {
  const name = t("Crop");

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
      await transform(context, [
        this.build({ left: 0.25, top: 0.25, right: 0.75, bottom: 0.75 }),
      ]);
      return true;
    },
    editable: true,
    activate: async function (index: number, args?: string[]) {
      let initialValue = args
        ? decodeRect(args[1])
        : { left: 0.1, right: 0.9, top: 0.1, bottom: 0.9 };
      if (!args) {
        imageController.addOperation(this.build(initialValue));
      }
      show(index, initialValue);

      return new Promise<boolean>((resolve) => {
        _deactivate = resolve;
      });
    },
    build: function (rect: {
      left: number;
      top: number;
      right: number;
      bottom: number;
    }) {
      return {
        name: this.filterName,
        args: ["1", encodeRect(rect)],
      };
    },
    buildUI: function (index: number, args: string[]) {
      const e = toolHeader(name, index, imageController, toolRegistrar);
      e.append(`<div>
      </div>`);
      const clearFcts: Function[] = [];
      clearFcts.push(
        emitter.on("updated", (event) => {
          if (index === event.index) {
            imageController.updateOperation(index, this.build(event.value, 0));
            hide(true);
          }
        })
      );
      clearFcts.push(
        emitter.on("preview", (event) => {
          if (index === event.index) {
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
