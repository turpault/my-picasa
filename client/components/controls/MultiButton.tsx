import React, { useCallback } from "react";

export interface MultiButtonProps {
  items: string[];
  selected: number[];
  onSelect: (index: number, indices: number[]) => void;
  multiselect?: boolean;
  toggle?: boolean;
  inverse?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

export function MultiButton({
  items,
  selected,
  onSelect,
  multiselect = false,
  toggle = false,
  inverse = false,
  className = "",
  style,
}: MultiButtonProps) {
  const handleClick = useCallback(
    (index: number) => {
      const sel = new Set(selected);

      if (toggle) {
        if (sel.has(index)) {
          sel.delete(index);
        } else {
          if (!multiselect) sel.clear();
          sel.add(index);
        }
      } else if (multiselect) {
        if (sel.has(index)) sel.delete(index);
        else sel.add(index);
      } else {
        if (sel.has(index)) return;
        sel.clear();
        sel.add(index);
      }

      const indices = Array.from(sel);
      onSelect(index, indices);
    },
    [selected, onSelect, multiselect, toggle],
  );

  return (
    <span
      className={`picasa-button-control picasa-button-group ${className}`.trim()}
      style={style}
    >
      {items.map((item, index) => {
        const isShaded = selected.includes(index) ? !inverse : inverse;
        const cls = [
          "picasa-multi-button",
          "picasa-button",
          isShaded && "picasa-multi-button-shaded",
        ]
          .filter(Boolean)
          .join(" ");

        if (item.startsWith("url:")) {
          return (
            <img
              key={index}
              className={cls}
              src={item.slice(4)}
              onClick={() => handleClick(index)}
            />
          );
        }
        return (
          <span key={index} className={cls} onClick={() => handleClick(index)}>
            {item}
          </span>
        );
      })}
    </span>
  );
}
