import { picture } from "../element-templates.js";
import { dragElement } from "../lib/draggable.js";
import { jBone as $ } from "../lib/jbone/jbone.js";
import { decodeOperations } from "../lib/utils.js";
import { ImageController } from "./image-controller.js";

export function make(e: HTMLElement, ctrl: ImageController) {
  dragElement(e);
  const history = $("#history", e);
  ctrl.events.on("operationListChanged", () => {
    // Update the operation list
    history.empty();

    for (const [index, { name, args }] of decodeOperations(
      ctrl.operationList()
    ).entries()) {
      history[0].appendChild(operationController(ctrl, name, args, index));
    }
  });
}

let opId = 0;
function operationController(
  ctrl: ImageController,
  operation: string,
  args: string[],
  index: number
): HTMLElement {
  opId++;
  const operationId = `op-${opId}`;
  switch (operation) {
    case "sepia": {
      const e = $(`<li class="w3-display-container">${operation}
      <span id="${operationId}" class="w3-button w3-display-right">&times;</span>
    </li>`);
      $(`#${operationId}`, e).on("click", () => {
        ctrl.onDeleteOperation(index);
      });
      return e[0];
    }
    case "crop64": {
      const e = $(`<li class="w3-display-container">${operation}
      <span id="${operationId}" class="w3-button w3-display-right">&times;</span>
    </li>`);
      $(`#${operationId}`, e).on("click", () => {
        ctrl.onDeleteOperation(index);
      });
      e.on("dlbclick", () => {
        ctrl.onEditOperation(index);
      });
      return e[0];
    }
  }
  return picture();
}
