import React from "react";

export interface InputProps {
  value: string;
  onChange: (value: string) => void;
  type?: string;
  name?: string;
  placeholder?: string;
  className?: string;
  style?: React.CSSProperties;
}

export function Input({
  value,
  onChange,
  type = "text",
  name,
  placeholder,
  className = "",
  style,
}: InputProps) {
  return (
    <input
      type={type}
      name={name}
      placeholder={placeholder}
      className={`picasa-input picasa-input-control ${className}`.trim()}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={style}
    />
  );
}
