import {
  PicasaFilter,
  RectArea,
  decodeRect,
  encodeRect,
} from "../../shared/lib/utils";
import { ImageController } from "../components/image-controller";
import { t } from "../components/strings";
import { ToolEditor } from "../components/tool-editor";
import { PAGES, ToolRegistrar } from "../components/tools";
import { _$ } from "../lib/dom";
import { State } from "../lib/state";
import { ActivableTool } from "./baseTool";
import {
  CROP_PREVIEW_STATE,
  CropPreviewStateDef,
  setupCropPreview,
} from "./previews/crop-preview";

class CropTool extends ActivableTool {
  constructor(
    private container: _$,
    controller: ImageController,
    private toolEditor: ToolEditor
  ) {
    super(t("Crop"), "crop64", controller);
  }

  icon() {
    return "resources/images/icons/crop.png";
  }

  async activate(): Promise<boolean> {
    let operation = this.controller.operationFromName(this.filterName);
    let isNew = !operation;
    if (isNew) {
      operation = this.build();
    } else {
      await this.controller.deleteOperation(operation.name);
    }
    await this.controller.enableZoom(false);
    await this.controller.recenter();

    const state = new State<CropPreviewStateDef>();
    state.setValue(CROP_PREVIEW_STATE.AREA, decodeRect(operation.args[1]));

    const originalArgs = operation.args.slice();
    const ok = await setupCropPreview(
      this.container,
      this.toolEditor,
      this.controller,
      state
    );
    await this.controller.enableZoom(true);

    if (ok) {
      operation.args[1] = encodeRect(state.getValue(CROP_PREVIEW_STATE.AREA));
      this.controller.addOperation(operation);
      return true;
    } else if (ok === null) {
      // Trash, do nothing 
    } else if (ok === false) {
      // undo
      if (!isNew) {
        operation.args = originalArgs;
        this.controller.addOperation(operation);
      }
    }

    return false;
  }

  build(rect?: RectArea) {
    return {
      name: this.filterName,
      args: ["1", encodeRect(rect || { left: 0, top: 0, bottom: 1, right: 1 })],
    };
  }
}

export function setupCrop(
  container: _$,
  imageController: ImageController,
  toolRegistrar: ToolRegistrar,
  toolEditor: ToolEditor
) {
  toolRegistrar.registerTool(
    PAGES.WRENCH,
    new CropTool(container, imageController, toolEditor)
  );
}
