import React, { useMemo } from "react";
import { AlbumEntry } from "../../../shared/types/types";
import { thumbnailUrl } from "../../imageProcess/client";

export interface CarouselProps {
  entries: AlbumEntry[];
  activeIndex: number;
  onSelect: (index: number) => void;
  count: number;
  className?: string;
  style?: React.CSSProperties;
}

export function Carousel({
  entries,
  activeIndex,
  onSelect,
  count,
  className = "",
  style,
}: CarouselProps) {
  const centerElement = Math.floor(count / 2);

  const visibleSlots = useMemo(() => {
    return Array.from({ length: count }, (_, i) => {
      const indexInList = i - centerElement + activeIndex;
      const entry = entries[indexInList];
      return { slotIndex: i, indexInList, entry };
    });
  }, [entries, activeIndex, count, centerElement]);

  const isLeftDisabled = activeIndex === 0;
  const isRightDisabled = activeIndex === entries.length - 1;

  return (
    <div className={`picasa-carousel ${className}`.trim()} style={style}>
      <button
        className={`picasa-carousel-navigation-button picasa-carousel-left-button${isLeftDisabled ? " disabled" : ""}`}
        onClick={() => !isLeftDisabled && onSelect(activeIndex - 1)}
      >
        ⬅
      </button>
      {visibleSlots.map(({ slotIndex, indexInList, entry }) => {
        const bgImage = entry
          ? `url("${thumbnailUrl(entry, "th-small")}")`
          : undefined;
        return (
          <div
            key={slotIndex}
            className={[
              "picasa-carousel-element",
              "strip-btn",
              !entry && "empty",
              slotIndex === centerElement && "selected",
            ]
              .filter(Boolean)
              .join(" ")}
            style={bgImage ? { backgroundImage: bgImage } : undefined}
            onClick={() => entry && onSelect(indexInList)}
          />
        );
      })}
      <button
        className={`picasa-carousel-navigation-button picasa-carousel-right-button${isRightDisabled ? " disabled" : ""}`}
        onClick={() => !isRightDisabled && onSelect(activeIndex + 1)}
      >
        ⮕
      </button>
    </div>
  );
}
