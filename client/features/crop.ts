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
  imageController: ImageController,
  toolRegistrar: ToolRegistrar
) {
  const name = t("Crop");

  const previewEmitter = buildEmitter<ValueChangeEvent>();
  const preview = setupCropPreview(container, previewEmitter, imageController);

  let activeIndex: number = -1;
  let _deactivate: ((commit: boolean) => void) | undefined;

  async function show(index: number, initialValue: RectRange) {
    activeIndex = index;
    await imageController.recenter();
    await imageController.enableZoom(false);
    await imageController.muteAt(index);
    preview.show(activeIndex, initialValue);
  }

  async function hide(commit: boolean) {
    activeIndex = -1;
    await imageController.enableZoom(true);
    await imageController.unmute();
    preview.hide();
    if (_deactivate) {
      _deactivate(commit);
      _deactivate = undefined;
    }
  }

  previewEmitter.on("cancel", () => {
    hide(false);
  });

  toolRegistrar.registerTool(name, GENERAL_TOOL_TAB, {
    multipleFamily: null,
    permanentIndex: 1,
    filterName: "crop64",
    enable: (e) => isPicture(e),
    reset: async function (index: number) {
      imageController.updateOperation(index, this.build());
    },
    icon: async function (context) {
      // Crop at 50% in the icon
      await transform(context, [
        this.build({ left: 0.2, top: 0.2, right: 0.8, bottom: 0.8 }),
      ]);
      return true;
    },
    editable: true,
    activate: async function (index: number, args?: string[]) {
      if (index !== 0) {
        debugger;
      }
      let initialValue = args
        ? decodeRect(args[1])
        : { left: 0, right: 1, top: 0, bottom: 1 };
      if (!args) {
        debugger;
        imageController.addOperation(this.build(initialValue));
      }
      show(index, initialValue);

      return new Promise<boolean>((resolve) => {
        _deactivate = resolve;
      });
    },
    build: function (
      rect: {
        left: number;
        top: number;
        right: number;
        bottom: number;
      } = { left: 0, top: 0, bottom: 1, right: 1 }
    ) {
      return {
        name: this.filterName,
        args: ["1", encodeRect(rect)],
      };
    },
    buildUI: function (index: number, args: string[]) {
      const e = toolHeader(name, index, imageController, toolRegistrar, this);
      e.append(`<div>
      </div>`);
      const clearFcts: Function[] = [];
      clearFcts.push(
        previewEmitter.on("updated", (event) => {
          if (index === event.index) {
            imageController.updateOperation(index, this.build(event.value, 0));
            hide(true);
          }
        })
      );
      clearFcts.push(
        previewEmitter.on("preview", (event) => {
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
