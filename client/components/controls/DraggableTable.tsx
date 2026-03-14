import React, { useRef, useCallback, useEffect } from "react";

export interface DraggableTableProps {
  onReorder: (fromIndex: number, toIndex: number) => void;
  children?: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

export function DraggableTable({
  onReorder,
  children,
  className = "",
  style,
}: DraggableTableProps) {
  const tableRef = useRef<HTMLTableElement>(null);
  const stateRef = useRef({
    currRow: null as HTMLElement | null,
    dragElem: null as HTMLElement | null,
    mouseDownX: 0,
    mouseDownY: 0,
    dragging: false,
  });

  const getTargetRow = useCallback((target: HTMLElement): HTMLElement | null => {
    const tag = target.tagName.toLowerCase();
    if (tag === "tr") return target;
    if (tag === "td") return target.closest("tr");
    return null;
  }, []);

  useEffect(() => {
    const table = tableRef.current;
    if (!table) return;

    const s = stateRef.current;

    function getStyle(el: HTMLElement, prop: string): string {
      return getComputedStyle(el)[prop as any] ?? "";
    }

    function isIntersecting(min0: number, max0: number, min1: number, max1: number) {
      return Math.max(min0, max0) >= Math.min(min1, max1) && Math.min(min0, max0) <= Math.max(min1, max1);
    }

    function swapRow(row: HTMLElement) {
      const tbody = table!.querySelector("tbody");
      if (!tbody || !s.currRow) return;
      const rows = Array.from(tbody.children);
      const fromIndex = rows.indexOf(s.currRow);
      const toIndex = rows.indexOf(row);
      const row1 = fromIndex > toIndex ? s.currRow : row;
      const row2 = fromIndex > toIndex ? row : s.currRow;
      tbody.insertBefore(row1, row2);
      onReorder(fromIndex, toIndex);
    }

    function moveRow(x: number, y: number) {
      if (s.dragElem) s.dragElem.style.transform = `translate3d(${x}px, ${y}px, 0)`;
      const dPos = s.dragElem?.getBoundingClientRect();
      const currStartY = dPos?.y ?? 0;
      const currEndY = currStartY + (dPos?.height ?? 0);
      const rows = table!.querySelectorAll("tbody tr");
      rows.forEach((rowElem, i) => {
        const r = rowElem.getBoundingClientRect();
        if (s.currRow !== rowElem && isIntersecting(currStartY, currEndY, r.y, r.y + r.height)) {
          if (Math.abs(currStartY - r.y) < r.height / 2) swapRow(rowElem as HTMLElement);
        }
      });
    }

    function onMouseDown(event: MouseEvent) {
      if (event.button !== 0) return;
      const target = getTargetRow(event.target as HTMLElement);
      if (!target || !table!.contains(target)) return;
      s.currRow = target;
      target.classList.add("is-dragging");

      const clone = target.cloneNode(true) as HTMLElement;
      clone.classList.add("draggable-table__drag");
      clone.style.height = getStyle(target, "height");
      clone.style.background = getStyle(target, "backgroundColor");
      for (let i = 0; i < target.children.length; i++) {
        const oldTD = target.children[i] as HTMLElement;
        const newTD = clone.children[i] as HTMLElement;
        newTD.style.width = getStyle(oldTD, "width");
        newTD.style.height = getStyle(oldTD, "height");
        newTD.style.padding = getStyle(oldTD, "padding");
        newTD.style.margin = getStyle(oldTD, "margin");
      }
      table!.appendChild(clone);
      s.dragElem = clone;

      const tPos = target.getBoundingClientRect();
      const dPos = clone.getBoundingClientRect();
      clone.style.bottom = `${dPos.y - tPos.y - tPos.height}px`;
      clone.style.left = "-1px";

      s.mouseDownX = event.clientX;
      s.mouseDownY = event.clientY;
      s.dragging = true;
    }

    function onMouseMove(event: MouseEvent) {
      if (!s.dragging) return;
      moveRow(event.clientX - s.mouseDownX, event.clientY - s.mouseDownY);
    }

    function onMouseUp() {
      if (!s.dragging) return;
      if (s.currRow) s.currRow.classList.remove("is-dragging");
      if (s.dragElem) table!.removeChild(s.dragElem);
      s.dragElem = null;
      s.dragging = false;
    }

    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };
  }, [onReorder, getTargetRow]);

  return (
    <table ref={tableRef} className={className} style={style}>
      {children}
    </table>
  );
}
