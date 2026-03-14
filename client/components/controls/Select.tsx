import React from "react";

export interface SelectProps {
  value: string;
  onChange: (value: string) => void;
  icon?: string;
  children?: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

export function Select({
  value,
  onChange,
  icon,
  children,
  className = "",
  style,
}: SelectProps) {
  const classes = ["picasa-select", "picasa-select-control"];
  if (icon) classes.push("picasa-select-icon");

  const bgStyle: React.CSSProperties = icon
    ? {
        background: `url(${icon}) 5px 50%/24px 24px no-repeat, linear-gradient(#f3f3f3, #dddddd)`,
      }
    : { background: "linear-gradient(#f3f3f3, #dddddd)" };

  return (
    <select
      className={[...classes, className].filter(Boolean).join(" ")}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{ ...bgStyle, ...style }}
    >
      {children}
    </select>
  );
}
