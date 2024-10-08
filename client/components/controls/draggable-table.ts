/**
 * Add drag and drop functionality to a table
 * @param table
 */

import { buildEmitter, Emitter } from "../../../shared/lib/event";

export type DragEvent = {
  reorder: {};
};
export function makeDraggableTable(table: HTMLElement): Emitter<DragEvent> {
  const emitter = buildEmitter<DragEvent>(false);
  const tbody = table.querySelector("tbody") as HTMLElement;

  let _currRow: HTMLElement | null = null,
    _dragElem: HTMLElement | null = null,
    _mouseDownX = 0,
    _mouseDownY = 0,
    _mouseX = 0,
    _mouseY = 0,
    _mouseDrag = false;

  function init() {
    bindMouse();
  }

  function bindMouse() {
    document.addEventListener("mousedown", (event: MouseEvent) => {
      if (event.button !== 0) return true;

      const target = getTargetRow(event.target as HTMLElement);
      if (target) {
        _currRow = target;
        addDraggableRow(target);
        _currRow.classList.add("is-dragging");

        const coords = getMouseCoords(event);
        _mouseDownX = coords.x;
        _mouseDownY = coords.y;

        _mouseDrag = true;
      }
      return false;
    });

    document.addEventListener("mousemove", (event: MouseEvent) => {
      if (!_mouseDrag) return;

      const coords = getMouseCoords(event);
      _mouseX = coords.x - _mouseDownX;
      _mouseY = coords.y - _mouseDownY;

      moveRow(_mouseX, _mouseY);
    });

    document.addEventListener("mouseup", () => {
      if (!_mouseDrag) return;

      if (_currRow) _currRow.classList.remove("is-dragging");
      if (_dragElem) table.removeChild(_dragElem);

      _dragElem = null;
      _mouseDrag = false;
    });
  }

  function swapRow(row: HTMLElement, index: number) {
    const currIndex = Array.from(tbody.children).indexOf(
        _currRow as HTMLElement,
      ),
      row1 = currIndex > index ? _currRow : row,
      row2 = currIndex > index ? row : _currRow;

    tbody.insertBefore(row1 as HTMLElement, row2 as HTMLElement);
    emitter.emit("reorder", {});
  }

  function moveRow(x: number, y: number) {
    if (_dragElem) _dragElem.style.transform = `translate3d(${x}px, ${y}px, 0)`;

    const dPos = _dragElem?.getBoundingClientRect(),
      currStartY = dPos?.y ?? 0,
      currEndY = (dPos?.y ?? 0) + (dPos?.height ?? 0),
      rows = getRows();

    for (let i = 0; i < rows.length; i++) {
      const rowElem = rows[i],
        rowSize = rowElem.getBoundingClientRect(),
        rowStartY = rowSize.y,
        rowEndY = rowStartY + rowSize.height;

      if (
        _currRow !== rowElem &&
        isIntersecting(currStartY, currEndY, rowStartY, rowEndY)
      ) {
        if (Math.abs(currStartY - rowStartY) < rowSize.height / 2)
          swapRow(rowElem, i);
      }
    }
  }

  function addDraggableRow(target: HTMLElement) {
    _dragElem = target.cloneNode(true) as HTMLElement;
    _dragElem.classList.add("draggable-table__drag");
    _dragElem.style.height = getStyle(target, "height");
    _dragElem.style.background = getStyle(target, "backgroundColor");
    for (let i = 0; i < target.children.length; i++) {
      const oldTD = target.children[i] as HTMLElement,
        newTD = _dragElem.children[i] as HTMLElement;
      newTD.style.width = getStyle(oldTD, "width");
      newTD.style.height = getStyle(oldTD, "height");
      newTD.style.padding = getStyle(oldTD, "padding");
      newTD.style.margin = getStyle(oldTD, "margin");
    }

    table.appendChild(_dragElem);

    const tPos = target.getBoundingClientRect(),
      dPos = _dragElem.getBoundingClientRect();
    _dragElem.style.bottom = `${dPos.y - tPos.y - tPos.height}px`;
    _dragElem.style.left = "-1px";

    document.dispatchEvent(
      new MouseEvent("mousemove", {
        view: window,
        cancelable: true,
        bubbles: true,
      }),
    );
  }

  function getRows(): NodeListOf<HTMLTableRowElement> {
    return table.querySelectorAll("tbody tr");
  }

  function getTargetRow(target: HTMLElement): HTMLElement | null {
    const elemName = target.tagName.toLowerCase();

    if (elemName === "tr") return target;
    if (elemName === "td") return target.closest("tr");
    return null;
  }

  function getMouseCoords(event: MouseEvent) {
    return {
      x: event.clientX,
      y: event.clientY,
    };
  }

  function getStyle(target: HTMLElement, styleName: string): string {
    const compStyle = getComputedStyle(target),
      style = compStyle[styleName as any];

    return style ? style : "";
  }

  function isIntersecting(
    min0: number,
    max0: number,
    min1: number,
    max1: number,
  ): boolean {
    return (
      Math.max(min0, max0) >= Math.min(min1, max1) &&
      Math.min(min0, max0) <= Math.max(min1, max1)
    );
  }

  init();
  return emitter;
}
