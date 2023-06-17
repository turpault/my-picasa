import { Cell } from "../types/types";
import { _$, $ } from "./dom";
import { calculateImagePositions } from "../../shared/lib/mosaic-positions";

/**
 *
 * @param parent The parent container
 * @param root The root cell. Each cell's id should match a child element id
 * @param width The container width
 * @param height The container height
 * @param gutter The gutter in pixels
 * @returns a function, called each time cells are updated
 */
export function resizable(
  parent: _$,
  root: Cell,
  width: number,
  height: number,
  gutter: number,
  onResized: () => void
) {
  let pos = calculateImagePositions(
    root,
    gutter,
    gutter / 2,
    gutter / 2,
    width - gutter,
    height - gutter
  );
  // create gutters
  parent.all(".gutter").forEach((e) => e.remove());
  let movingGutter: _$ | undefined;
  for (const gutterPos of pos.gutters) {
    const gutterId = `${gutterPos.leftCell.id}-${gutterPos.rightCell.id}`;
    const gutterElement = $(`<div id="${gutterId}" class="gutter"/>`);
    gutterElement.attachData(gutterPos);
    parent.append(
      gutterElement
        .css({
          cursor: gutterPos.direction === "v" ? "ew-resize" : "ns-resize",
        })
        .on("mousedown", () => {
          movingGutter = gutterElement;
          document.body.addEventListener("mousemove", resize);
          document.body.addEventListener("mouseup", cancelResize);
        })
        .on("touchstart", () => {
          movingGutter = gutterElement;
          document.body.addEventListener("touchmove", resize);
          document.body.addEventListener("touchend", cancelResize);
        })
    );
  }

  reposition();
  function reposition() {
    for (const gutterPos of pos.gutters) {
      const gutterId = `${gutterPos.leftCell.id}-${gutterPos.rightCell.id}`;
      $(`#${gutterId}`)
        .absolutePosition({ x: gutterPos.left, y: gutterPos.top })
        .css({
          width: gutterPos.width + "px",
          height: gutterPos.height + "px",
        });
    }
    for (const imagePos of pos.images) {
      const imageId = `${imagePos.cell.id}`;
      $(`#${imageId}`)
        .absolutePosition({ x: imagePos.left, y: imagePos.top })
        .css({
          width: imagePos.width + "px",
          height: imagePos.height + "px",
        });
    }
  }
  function resize(ev: MouseEvent | TouchEvent) {
    ev.preventDefault();
    const parentRect = parent.clientRect();
    const x =
      ((ev as MouseEvent).x || (ev as TouchEvent).touches[0].clientX) -
      parentRect.left;
    const y =
      ((ev as MouseEvent).y || (ev as TouchEvent).touches[0].clientY) -
      parentRect.top;
    if (!movingGutter) return;
    const gutterPos = movingGutter.getData()[0];
    if (!gutterPos || !gutterPos.leftCell || !gutterPos.rightCell) return;
    const leftId = gutterPos.leftCell.id;
    const rightId = gutterPos.rightCell.id;
    if (gutterPos.direction === "v") {
      // recalculating left and right weights
      const totalWidth =
        pos.cellBounds[leftId].width + pos.cellBounds[rightId].width;
      const left = pos.cellBounds[leftId].left;
      const weight = (x - left) / totalWidth;
      if (weight < 0.1 || weight > 0.9) return;

      gutterPos.leftCell.weight = weight;
      gutterPos.rightCell.weight = 1 - weight;
    } else {
      const totalHeight =
        pos.cellBounds[leftId].height + pos.cellBounds[rightId].height;
      const top = pos.cellBounds[leftId].top;
      const weight = (y - top) / totalHeight;
      if (weight < 0.1 || weight > 0.9) return;
      gutterPos.leftCell.weight = weight;
      gutterPos.rightCell.weight = 1 - weight;
    }
    pos = calculateImagePositions(
      root,
      gutter,
      gutter / 2,
      gutter / 2,
      width - gutter,
      height - gutter
    );
    reposition();
    onResized();
  }
  function cancelResize() {
    document.body.removeEventListener("mousemove", resize);
    document.body.removeEventListener("mouseup", cancelResize);
    document.body.removeEventListener("touchmove", resize);
    document.body.removeEventListener("touchend", cancelResize);
  }
}
