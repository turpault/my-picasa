import { useState, useCallback, useEffect, useRef } from "react";
import { createPortal } from "react-dom";

export interface MenuItem {
  label: string;
  icon?: string;
  action: () => void;
  disabled?: boolean;
}

export interface ContextMenuProps {
  items: MenuItem[];
  position: { x: number; y: number };
  onClose: () => void;
}

function ContextMenu({ items, position, onClose }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = menuRef.current;
    if (!el) return;

    const rect = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    if (rect.right > vw) el.style.left = `${vw - rect.width}px`;
    if (rect.bottom > vh) el.style.top = `${vh - rect.height}px`;
  }, [position]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", handleClick, true);
    document.addEventListener("keydown", handleKey, true);
    return () => {
      document.removeEventListener("mousedown", handleClick, true);
      document.removeEventListener("keydown", handleKey, true);
    };
  }, [onClose]);

  return (
    <div
      ref={menuRef}
      className="w3-card-4 context-menu"
      style={{
        position: "fixed",
        left: position.x,
        top: position.y,
        zIndex: 10000,
        minWidth: 160,
      }}
    >
      {items.map((item, i) => (
        <button
          key={i}
          className="w3-button w3-bar-item"
          style={{ display: "flex", alignItems: "center", gap: 8 }}
          disabled={item.disabled}
          onClick={() => {
            item.action();
            onClose();
          }}
        >
          {item.icon && (
            <img src={item.icon} alt="" style={{ width: 16, height: 16 }} />
          )}
          <span>{item.label}</span>
        </button>
      ))}
    </div>
  );
}

interface ContextMenuState {
  items: MenuItem[];
  position: { x: number; y: number };
}

export function useContextMenu() {
  const [state, setState] = useState<ContextMenuState | null>(null);

  const show = useCallback(
    (event: React.MouseEvent, items: MenuItem[]) => {
      event.preventDefault();
      event.stopPropagation();
      setState({ items, position: { x: event.clientX, y: event.clientY } });
    },
    [],
  );

  const close = useCallback(() => setState(null), []);

  const ContextMenuPortal = useCallback(
    () =>
      state
        ? createPortal(
            <ContextMenu
              items={state.items}
              position={state.position}
              onClose={close}
            />,
            document.body,
          )
        : null,
    [state, close],
  );

  return { show, ContextMenuPortal };
}
