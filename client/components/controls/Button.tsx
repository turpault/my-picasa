import React from "react";

export interface ButtonProps {
  icon?: string;
  type?: string;
  iconPos?: "left" | "right" | "top";
  onClick?: (e: React.MouseEvent) => void;
  disabled?: boolean;
  children?: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

export function Button({
  icon,
  type,
  iconPos = "left",
  onClick,
  disabled,
  children,
  className = "",
  style,
}: ButtonProps) {
  const classes = ["picasa-button", "picasa-button-control"];
  let bgStyle: React.CSSProperties = {};

  if (type) {
    classes.push(`picasa-button-${type}`, "picasa-button-type");
  } else if (icon) {
    classes.push("picasa-button-icon");
    const pos =
      iconPos === "top"
        ? `url(${icon}) 50% 5px/24px 24px no-repeat`
        : `url(${icon}) 5px 50%/24px 24px no-repeat`;
    bgStyle = {
      background: `${pos}, linear-gradient(#f3f3f3, #dddddd)`,
    };
  } else {
    bgStyle = { background: "linear-gradient(#f3f3f3, #dddddd)" };
  }

  return (
    <span
      className={[...classes, className].filter(Boolean).join(" ")}
      style={{ ...bgStyle, ...style }}
      onClick={disabled ? undefined : onClick}
      aria-disabled={disabled || undefined}
    >
      {children}
    </span>
  );
}
