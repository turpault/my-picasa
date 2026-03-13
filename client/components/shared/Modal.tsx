import { useState, useCallback, useRef, type ReactNode } from "react";

export interface ButtonDef {
  label: string;
  value: string;
  primary?: boolean;
}

export interface ModalProps {
  title?: string;
  visible: boolean;
  onClose?: () => void;
  children: ReactNode;
  buttons?: ButtonDef[];
  onButton?: (value: string) => void;
}

export function Modal({
  title,
  visible,
  onClose,
  children,
  buttons,
  onButton,
}: ModalProps) {
  if (!visible) return null;

  return (
    <div
      className="w3-modal"
      style={{ display: "block" }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <div className="w3-modal-content w3-animate-opacity">
        {title && (
          <header className="w3-container w3-theme">
            <span
              className="w3-button w3-display-topright"
              onClick={onClose}
            >
              &times;
            </span>
            <h3>{title}</h3>
          </header>
        )}
        <div className="w3-container" style={{ padding: "16px" }}>
          {children}
        </div>
        {buttons && buttons.length > 0 && (
          <footer
            className="w3-container"
            style={{ padding: "8px 16px", textAlign: "right" }}
          >
            {buttons.map((btn) => (
              <button
                key={btn.value}
                className={`w3-button${btn.primary ? " w3-theme" : ""}`}
                style={{ marginLeft: 8 }}
                onClick={() => onButton?.(btn.value)}
              >
                {btn.label}
              </button>
            ))}
          </footer>
        )}
      </div>
    </div>
  );
}

interface ModalHookOptions {
  title?: string;
  message?: string;
  buttons?: ButtonDef[];
}

export function useModal() {
  const [visible, setVisible] = useState(false);
  const [options, setOptions] = useState<ModalHookOptions>({});
  const resolveRef = useRef<((value: string) => void) | null>(null);

  const show = useCallback(
    (opts: ModalHookOptions): Promise<string> =>
      new Promise((resolve) => {
        resolveRef.current = resolve;
        setOptions(opts);
        setVisible(true);
      }),
    [],
  );

  const handleButton = useCallback((value: string) => {
    setVisible(false);
    resolveRef.current?.(value);
    resolveRef.current = null;
  }, []);

  const handleClose = useCallback(() => {
    setVisible(false);
    resolveRef.current?.("");
    resolveRef.current = null;
  }, []);

  const ModalComponent = useCallback(
    () => (
      <Modal
        title={options.title}
        visible={visible}
        onClose={handleClose}
        buttons={options.buttons}
        onButton={handleButton}
      >
        {options.message && <p>{options.message}</p>}
      </Modal>
    ),
    [visible, options, handleClose, handleButton],
  );

  return { show, ModalComponent };
}
