import React, { useCallback, useMemo } from "react";

export interface SliderProps {
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step?: number;
  ticks?: number[];
  snapPercent?: number;
  className?: string;
  style?: React.CSSProperties;
}

export function Slider({
  value,
  onChange,
  min,
  max,
  step,
  ticks: ticksProp = [],
  snapPercent = 2.5,
  className = "",
  style,
}: SliderProps) {
  const resolvedStep = step ?? (max - min < 100 ? (max - min) / 100 : undefined);

  const allTicks = useMemo(() => [min, ...ticksProp, max], [min, max, ticksProp]);

  const backgroundStyle = useMemo(() => {
    const intervals = allTicks
      .map((v) => {
        const pos = (94 * (v - min)) / (max - min) + 2.5;
        const dpos = pos + 1;
        return `transparent ${pos}%, gray ${pos}%, gray ${dpos}%, transparent ${dpos}%`;
      })
      .join(", ");
    return `linear-gradient(to right, ${intervals}), linear-gradient(to bottom, #bec9d1, #ccd5e1)`;
  }, [allTicks, min, max]);

  const handleInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      let v = parseFloat(e.target.value);
      const range = max - min;
      for (const t of allTicks) {
        if (Math.abs(v - t) < (snapPercent * range) / 100) {
          v = t;
          break;
        }
      }
      onChange(v);
    },
    [onChange, min, max, allTicks, snapPercent],
  );

  return (
    <input
      type="range"
      className={`picasa-slider ${className}`.trim()}
      min={min}
      max={max}
      step={resolvedStep}
      value={value}
      onInput={handleInput}
      onChange={() => {}}
      style={{ background: backgroundStyle, ...style }}
    />
  );
}
