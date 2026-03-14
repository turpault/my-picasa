import React, { useState, useRef, useEffect, useCallback } from "react";

export interface MultiDropdownOption {
  value: string;
  label: string;
}

export interface MultiDropdownProps {
  options: MultiDropdownOption[];
  selected: string[];
  onChange: (selected: string[]) => void;
  placeholder?: string;
  search?: boolean;
  selectAll?: boolean;
  max?: number | null;
  closeOnSelect?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

export function MultiDropdown({
  options,
  selected,
  onChange,
  placeholder = "Select item(s)",
  search = true,
  selectAll = true,
  max = null,
  closeOnSelect = false,
  className = "",
  style,
}: MultiDropdownProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("click", onClickOutside);
    return () => document.removeEventListener("click", onClickOutside);
  }, []);

  const toggleValue = useCallback(
    (value: string) => {
      const isSelected = selected.includes(value);
      if (isSelected) {
        onChange(selected.filter((v) => v !== value));
      } else {
        if (max && selected.length >= max) return;
        onChange([...selected, value]);
      }
      if (closeOnSelect) setOpen(false);
      setQuery("");
    },
    [selected, onChange, max, closeOnSelect],
  );

  const handleSelectAll = useCallback(() => {
    const allSelected = selected.length === options.length;
    onChange(allSelected ? [] : options.map((o) => o.value));
  }, [selected, options, onChange]);

  const filtered = query
    ? options.filter((o) => o.label.toLowerCase().includes(query.toLowerCase()))
    : options;

  return (
    <div ref={containerRef} className={`multi-select ${className}`.trim()} style={style}>
      <div
        className={`multi-select-header${open ? " multi-select-header-active" : ""}`}
        onClick={() => setOpen(!open)}
      >
        {max && (
          <span className="multi-select-header-max">
            {selected.length}/{max}
          </span>
        )}
        {selected.length > 0 ? (
          selected.map((value) => {
            const opt = options.find((o) => o.value === value);
            return (
              <span key={value} className="multi-select-header-option" data-value={value}>
                {opt?.label ?? value}
              </span>
            );
          })
        ) : (
          <span className="multi-select-header-placeholder">{placeholder}</span>
        )}
      </div>
      {open && (
        <div className="multi-select-options">
          {search && (
            <input
              type="text"
              className="multi-select-search"
              placeholder="Search..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          )}
          {selectAll && (
            <div
              className={`multi-select-all${selected.length === options.length ? " multi-select-selected" : ""}`}
              onClick={handleSelectAll}
            >
              <span className="multi-select-option-radio" />
              <span className="multi-select-option-text">Select all</span>
            </div>
          )}
          {filtered.map((option) => (
            <div
              key={option.value}
              className={`multi-select-option${selected.includes(option.value) ? " multi-select-selected" : ""}`}
              data-value={option.value}
              onClick={() => toggleValue(option.value)}
            >
              <span className="multi-select-option-radio" />
              <span className="multi-select-option-text">{option.label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
