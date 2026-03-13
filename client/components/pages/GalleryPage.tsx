import { useCallback, useEffect, useRef, useState } from "react";
import type { AlbumEntry } from "../../../shared/types/types";
import { isPicture, isVideo } from "../../../shared/lib/utils";
import { assetUrl, thumbnailUrl } from "../../imageProcess/client";
import { useAppEmitter } from "../../context/AppContext";

interface GalleryPageProps {
  initialList: AlbumEntry[];
  initialIndex: number;
  onClose: () => void;
}

export function GalleryPage({
  initialList,
  initialIndex,
  onClose,
}: GalleryPageProps) {
  const appEmitter = useAppEmitter();
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const stripRef = useRef<HTMLDivElement>(null);

  const entry = initialList[currentIndex];
  const total = initialList.length;

  const goPrev = useCallback(() => {
    setCurrentIndex((i) => (i > 0 ? i - 1 : i));
  }, []);

  const goNext = useCallback(() => {
    setCurrentIndex((i) => (i < total - 1 ? i + 1 : i));
  }, [total]);

  useEffect(() => {
    const off = appEmitter.on("keyDown", (e) => {
      if (e.code === "Escape") {
        e.preventDefault();
        onClose();
      } else if (e.code === "ArrowLeft") {
        e.preventDefault();
        goPrev();
      } else if (e.code === "ArrowRight") {
        e.preventDefault();
        goNext();
      }
    });
    return off;
  }, [appEmitter, onClose, goPrev, goNext]);

  useEffect(() => {
    const thumb = stripRef.current?.children[currentIndex] as HTMLElement;
    thumb?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  }, [currentIndex]);

  if (!entry) return null;

  return (
    <div className="gallery-container" style={containerStyle}>
      {/* Navigation arrows */}
      {currentIndex > 0 && (
        <button style={{ ...arrowStyle, left: 8 }} onClick={goPrev}>
          &#x276E;
        </button>
      )}
      {currentIndex < total - 1 && (
        <button style={{ ...arrowStyle, right: 8 }} onClick={goNext}>
          &#x276F;
        </button>
      )}

      {/* Main display */}
      <div style={mainAreaStyle}>
        {isVideo(entry) ? (
          <video
            key={entry.name}
            src={assetUrl(entry)}
            controls
            autoPlay
            style={mediaStyle}
          />
        ) : (
          <img
            key={entry.name}
            src={assetUrl(entry)}
            alt={entry.name}
            style={mediaStyle}
          />
        )}
      </div>

      {/* Caption bar */}
      <div style={captionBarStyle}>
        <span>{entry.name}</span>
        <span>
          {currentIndex + 1} / {total}
        </span>
      </div>

      {/* Thumbnail strip */}
      <div ref={stripRef} style={stripStyle}>
        {initialList.map((e, idx) => (
          <img
            key={`${e.album.key}/${e.name}`}
            src={thumbnailUrl(e, "th-small")}
            alt={e.name}
            onClick={() => setCurrentIndex(idx)}
            style={{
              ...thumbStyle,
              outline: idx === currentIndex ? "2px solid #fff" : "2px solid transparent",
              opacity: idx === currentIndex ? 1 : 0.6,
            }}
          />
        ))}
      </div>
    </div>
  );
}

const containerStyle: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  display: "flex",
  flexDirection: "column",
  background: "#111",
  color: "#fff",
  overflow: "hidden",
};

const mainAreaStyle: React.CSSProperties = {
  flex: 1,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  overflow: "hidden",
  minHeight: 0,
};

const mediaStyle: React.CSSProperties = {
  maxWidth: "100%",
  maxHeight: "100%",
  objectFit: "contain",
};

const arrowStyle: React.CSSProperties = {
  position: "absolute",
  top: "50%",
  transform: "translateY(-50%)",
  zIndex: 10,
  background: "rgba(0,0,0,0.5)",
  color: "#fff",
  border: "none",
  fontSize: 28,
  padding: "12px 10px",
  cursor: "pointer",
  borderRadius: 4,
};

const captionBarStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  padding: "4px 12px",
  fontSize: 13,
  background: "rgba(0,0,0,0.6)",
  flexShrink: 0,
};

const stripStyle: React.CSSProperties = {
  display: "flex",
  gap: 4,
  padding: "6px 8px",
  overflowX: "auto",
  background: "rgba(0,0,0,0.8)",
  flexShrink: 0,
};

const thumbStyle: React.CSSProperties = {
  width: 56,
  height: 56,
  objectFit: "cover",
  cursor: "pointer",
  borderRadius: 3,
  flexShrink: 0,
  transition: "opacity 0.15s, outline-color 0.15s",
};
