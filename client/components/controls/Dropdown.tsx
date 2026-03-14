import React, { useState } from "react";

export interface DropdownItem {
  label: string;
  key: any;
}

export interface DropdownProps {
  label: string;
  items: DropdownItem[];
  selectedIndex?: number;
  onSelect: (index: number, key: any) => void;
  className?: string;
  style?: React.CSSProperties;
}

export function Dropdown({
  label,
  items,
  selectedIndex,
  onSelect,
  className = "",
  style,
}: DropdownProps) {
  const [displayValue, setDisplayValue] = useState(
    selectedIndex != null && selectedIndex < items.length
      ? items[selectedIndex].label
      : "",
  );

  const handleSelect = (index: number) => {
    setDisplayValue(items[index].label);
    onSelect(index, items[index].key);
  };

  return (
    <div className={`w3-dropdown-hover ${className}`.trim()} style={style}>
      <button className="dropdown-button w3-button">
        {label}
        <span style={{ float: "right" }} className="dropdown-value">
          {displayValue}
        </span>
      </button>
      <div className="dropdown-content w3-dropdown-content w3-bar-block w3-card-4">
        {items.map((item, index) => (
          <a
            key={index}
            className="dropdown-item w3-bar-item w3-button"
            onClick={() => handleSelect(index)}
          >
            {item.label}
          </a>
        ))}
      </div>
    </div>
  );
}
