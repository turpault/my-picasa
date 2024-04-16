import { _$ } from "../lib/dom";

export class ToolEditor {
  constructor(
    private editing: boolean = false,
    private editorControls: _$,
    private imageContainer: _$
  ) {
    this.editorControls.hide();
  }
  activate(controls: _$, overlay?: _$) {
    if (this.editing) {
      return;
    }
    this.editorControls.empty();
    this.editorControls.append(controls);
    if (overlay) this.imageContainer.append(overlay);
    this.editorControls.show();
    this.editing = true;
    this.deactivate = () => {
      if (this.editing) {
        this.editing = false;
        controls.remove();
        if (overlay) overlay.remove();
        this.editorControls.hide();
      }
    };
  }
  deactivate() {
    debugger;
  }
}
