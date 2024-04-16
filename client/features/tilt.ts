import { PicasaFilter } from "../../shared/lib/utils";
import { ImageController } from "../components/image-controller";
import { t } from "../components/strings";
import { ToolEditor } from "../components/tool-editor";
import { PAGES, ToolRegistrar } from "../components/tools";
import { _$ } from "../lib/dom";
import { State } from "../lib/state";
import { ActivableTool } from "./baseTool";
import {
  TILT_PREVIEW_STATE,
  TiltPreviewStateDef,
  setupTiltPreview,
} from "./previews/tilt-preview";

class TiltTool extends ActivableTool {
  constructor(
    private container: _$,
    controller: ImageController,
    private toolEditor: ToolEditor
  ) {
    super(t("Tilt"), "tilt", controller);
  }

  icon() {
    return "resources/images/icons/tilt.png";
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

    const state = new State<TiltPreviewStateDef>();
    state.setValue(TILT_PREVIEW_STATE.ANGLE, parseFloat(operation.args[1]));
    state.setValue(TILT_PREVIEW_STATE.ZOOM, parseFloat(operation.args[2]));

    const originalArgs = operation.args.slice();
    const ok = await setupTiltPreview(this.toolEditor, this.controller, state);
    await this.controller.enableZoom(true);

    if (ok) {
      operation.args[1] = state.getValue(TILT_PREVIEW_STATE.ANGLE).toString();
      operation.args[2] = state.getValue(TILT_PREVIEW_STATE.ZOOM).toString();
      this.controller.addOperation(operation);
      return true;
    } else if (ok === null) {
      // Do nothing
    } else if (ok === false) {
      // undo
      if (!isNew) {
        operation.args = originalArgs;
        this.controller.addOperation(operation);
      }
    }

    return false;
  }

  build(angle: number = 0, zoom: number = 0) {
    return {
      name: this.filterName,
      args: ["1", angle.toString(), zoom.toString()],
    };
  }
}

export function setupTilt(
  container: _$,
  imageController: ImageController,
  toolRegistrar: ToolRegistrar,
  toolEditor: ToolEditor
) {
  toolRegistrar.registerTool(
    PAGES.WRENCH,
    new TiltTool(container, imageController, toolEditor)
  );
}
