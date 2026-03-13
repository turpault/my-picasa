import React, {
  useCallback,
  useRef,
  useState,
  useEffect,
  type ReactNode,
  type InputHTMLAttributes,
} from "react";

// ---------------------------------------------------------------------------
// Button
// ---------------------------------------------------------------------------

export interface ButtonProps {
  icon?: string;
  type?: string;
  iconPos?: "left" | "right" | "top";
  onClick?: () => void;
  style?: React.CSSProperties;
  className?: string;
  id?: string;
  children?: ReactNode;
  disabled?: boolean;
  tooltip?: string;
}

export const Button = React.memo(function Button({
  icon,
  type,
  iconPos = "left",
  onClick,
  style,
  className,
  id,
  children,
  disabled,
  tooltip,
}: ButtonProps) {
  const typeClass = type ? `picasa-button-${type} picasa-button-type` : "";
  const iconClass = !type && icon ? "picasa-button-icon" : "";

  const iconStyle: React.CSSProperties | undefined =
    !type && icon
      ? iconPos === "top"
        ? {
            background: `url(${icon}) 50% 5px/24px 24px no-repeat, linear-gradient(#f3f3f3, #dddddd)`,
          }
        : {
            background: `url(${icon}) 5px 50%/24px 24px no-repeat, linear-gradient(#f3f3f3, #dddddd)`,
          }
      : !type
        ? { background: "linear-gradient(#f3f3f3, #dddddd)" }
        : undefined;

  return (
    <button
      id={id}
      className={[
        "picasa-button",
        "picasa-button-control",
        typeClass,
        iconClass,
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      style={{ ...iconStyle, ...style }}
      onClick={onClick}
      disabled={disabled}
      data-tooltip-below={tooltip}
    >
      {icon && type && (
        <img
          src={icon}
          className={`picasa-button-icon ${iconPos}`}
          alt=""
        />
      )}
      {children && <span className="picasa-button-label">{children}</span>}
    </button>
  );
});

// ---------------------------------------------------------------------------
// Slider
// ---------------------------------------------------------------------------

export interface SliderProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  snap?: number;
  label?: string;
  className?: string;
  style?: React.CSSProperties;
}

export const Slider = React.memo(function Slider({
  value,
  onChange,
  min = 0,
  max = 100,
  step: stepProp,
  snap,
  label,
  className,
  style,
}: SliderProps) {
  const range = max - min;
  const step = stepProp ?? (range < 100 ? range / 100 : undefined);

  const ticks = [min, ...(snap != null ? [snap] : []), max];
  const intervals = ticks
    .map((v) => {
      const pos = (94 * (v - min)) / range + 2.5;
      const dpos = pos + 1;
      return `transparent ${pos}%, gray ${pos}%, gray ${dpos}%, transparent ${dpos}%`;
    })
    .join(", ");

  const bgStyle: React.CSSProperties = {
    background: `linear-gradient(to right, ${intervals}), linear-gradient(to bottom, #bec9d1, #ccd5e1)`,
  };

  const handleInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      let v = parseFloat(e.target.value);
      if (snap != null) {
        const threshold = (2.5 * range) / 100;
        if (Math.abs(v - snap) < threshold) {
          v = snap;
        }
      }
      onChange(v);
    },
    [onChange, snap, range],
  );

  return (
    <input
      type="range"
      className={["picasa-slider", className].filter(Boolean).join(" ")}
      style={{ ...bgStyle, ...style }}
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={handleInput}
      aria-label={label}
    />
  );
});

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

export interface InputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "onChange"> {
  className?: string;
  onChange?: (value: string) => void;
}

export const Input = React.memo(function Input({
  className,
  onChange,
  ...rest
}: InputProps) {
  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange?.(e.target.value);
    },
    [onChange],
  );

  return (
    <input
      {...rest}
      className={["picasa-input", "picasa-input-control", className]
        .filter(Boolean)
        .join(" ")}
      onChange={handleChange}
    />
  );
});

// ---------------------------------------------------------------------------
// Select
// ---------------------------------------------------------------------------

export interface SelectProps {
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  className?: string;
  style?: React.CSSProperties;
  icon?: string;
}

export const Select = React.memo(function Select({
  value,
  onChange,
  options,
  className,
  style,
  icon,
}: SelectProps) {
  const bgStyle: React.CSSProperties = icon
    ? {
        background: `url(${icon}) 5px 50%/24px 24px no-repeat, linear-gradient(#f3f3f3, #dddddd)`,
      }
    : { background: "linear-gradient(#f3f3f3, #dddddd)" };

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      onChange(e.target.value);
    },
    [onChange],
  );

  return (
    <select
      className={[
        "picasa-select",
        "picasa-select-control",
        icon && "picasa-select-icon",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      style={{ ...bgStyle, ...style }}
      value={value}
      onChange={handleChange}
    >
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
});

// ---------------------------------------------------------------------------
// MultiButton
// ---------------------------------------------------------------------------

export interface MultiButtonItem {
  label?: string;
  icon?: string;
}

export interface MultiButtonProps {
  items: MultiButtonItem[];
  selected: number;
  onChange: (index: number) => void;
  className?: string;
}

export const MultiButton = React.memo(function MultiButton({
  items,
  selected,
  onChange,
  className,
}: MultiButtonProps) {
  return (
    <div
      className={["picasa-button-control", "picasa-button-group", className]
        .filter(Boolean)
        .join(" ")}
    >
      {items.map((item, index) => {
        const isSelected = index === selected;
        const cls = [
          "picasa-multi-button",
          "picasa-button",
          isSelected && "picasa-multi-button-shaded",
        ]
          .filter(Boolean)
          .join(" ");

        return item.icon ? (
          <img
            key={index}
            className={cls}
            src={item.icon}
            alt={item.label ?? ""}
            onClick={() => onChange(index)}
          />
        ) : (
          <span key={index} className={cls} onClick={() => onChange(index)}>
            {item.label}
          </span>
        );
      })}
    </div>
  );
});

// ---------------------------------------------------------------------------
// Dropdown
// ---------------------------------------------------------------------------

export interface DropdownProps {
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  label?: string;
  className?: string;
}

export const Dropdown = React.memo(function Dropdown({
  value,
  onChange,
  options,
  label,
  className,
}: DropdownProps) {
  const currentLabel =
    options.find((o) => o.value === value)?.label ?? "";

  return (
    <div
      className={["w3-dropdown-hover", className].filter(Boolean).join(" ")}
    >
      <button className="dropdown-button w3-button">
        {label}
        <span className="dropdown-value" style={{ float: "right" }}>
          {currentLabel}
        </span>
      </button>
      <div className="dropdown-content w3-dropdown-content w3-bar-block w3-card-4">
        {options.map((opt) => (
          <a
            key={opt.value}
            className="dropdown-item w3-bar-item w3-button"
            onClick={() => onChange(opt.value)}
          >
            {opt.label}
          </a>
        ))}
      </div>
    </div>
  );
});

// ---------------------------------------------------------------------------
// Form
// ---------------------------------------------------------------------------

export interface FormField {
  label: string;
  id: string;
  type: "text" | "button" | "select" | "slider" | "choice" | "separator" | "color";
  props?: Record<string, any>;
}

export interface FormProps {
  fields: FormField[];
  values?: Record<string, any>;
  onChange?: (id: string, value: any) => void;
  onSubmit?: (values: Record<string, any>) => void;
  className?: string;
}

export function Form({
  fields,
  values = {},
  onChange,
  onSubmit,
  className,
}: FormProps) {
  const [local, setLocal] = useState<Record<string, any>>(values);

  useEffect(() => {
    setLocal(values);
  }, [values]);

  const set = useCallback(
    (id: string, v: any) => {
      setLocal((prev) => ({ ...prev, [id]: v }));
      onChange?.(id, v);
    },
    [onChange],
  );

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      onSubmit?.(local);
    },
    [onSubmit, local],
  );

  return (
    <form
      className={["form", className].filter(Boolean).join(" ")}
      onSubmit={handleSubmit}
    >
      {fields.map((field) => {
        const { id, label, type, props: fp = {} } = field;

        if (type === "separator") {
          return (
            <div key={id} className="form-entry">
              <div className="form-separator">{label}</div>
            </div>
          );
        }

        if (type === "text" || type === "color") {
          return (
            <div key={id} className="form-entry">
              <label>{label}</label>
              <Input
                type={type}
                value={local[id] ?? ""}
                onChange={(v) => set(id, v)}
                {...fp}
              />
            </div>
          );
        }

        if (type === "button") {
          return (
            <div key={id} className="form-entry">
              <Button
                className="form-button"
                icon={fp.icon}
                onClick={() => {
                  set(id, true);
                  set(id, false);
                }}
              >
                {label}
              </Button>
            </div>
          );
        }

        if (type === "select") {
          return (
            <div key={id} className="form-entry">
              <label>{label}</label>
              <Select
                value={local[id] ?? ""}
                onChange={(v) => set(id, v)}
                options={fp.options ?? []}
                {...fp}
              />
            </div>
          );
        }

        if (type === "slider") {
          return (
            <div key={id} className="form-entry">
              <label>{label}</label>
              <Slider
                value={local[id] ?? fp.min ?? 0}
                onChange={(v) => set(id, v)}
                min={fp.min}
                max={fp.max}
                step={fp.step}
                snap={fp.snap}
              />
            </div>
          );
        }

        if (type === "choice") {
          const items: MultiButtonItem[] = (fp.values ?? []).map(
            (v: string | number) =>
              typeof v === "string" && v.startsWith("url:")
                ? { icon: v.slice(4) }
                : { label: String(v) },
          );
          const selectedIndex = (fp.values ?? []).indexOf(local[id]);
          return (
            <div key={id} className="form-entry">
              <label>{label}</label>
              <MultiButton
                className="form-button"
                items={items}
                selected={selectedIndex >= 0 ? selectedIndex : 0}
                onChange={(idx) => set(id, (fp.values ?? [])[idx])}
              />
            </div>
          );
        }

        return null;
      })}
    </form>
  );
}
