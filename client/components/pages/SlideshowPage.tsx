import { useCallback, useEffect, useState } from "react";
import type { AlbumEntry } from "../../../shared/types/types";
import { thumbnailUrl } from "../../imageProcess/client";
import { useAppEmitter, usePicisaService } from "../../context/AppContext";
import { t } from "../strings";

interface SlideshowPageProps {
  project: { name: string; entries: AlbumEntry[] };
  onClose: () => void;
}

type TransitionType = "fade" | "slide" | "zoom" | "none";
type OutputFormat = "mp4" | "webm";

interface SlideItem {
  id: string;
  entry: AlbumEntry;
  text: string;
  duration: number;
}

export function SlideshowPage({ project, onClose }: SlideshowPageProps) {
  const appEmitter = useAppEmitter();
  const service = usePicisaService();
  const [slides, setSlides] = useState<SlideItem[]>(() =>
    project.entries.map((entry) => ({
      id: crypto.randomUUID(),
      entry,
      text: "",
      duration: 3,
    })),
  );
  const [transition, setTransition] = useState<TransitionType>("fade");
  const [delay, setDelay] = useState(0.5);
  const [format, setFormat] = useState<OutputFormat>("mp4");

  useEffect(() => {
    const off = appEmitter.on("keyDown", (e) => {
      if (e.code === "Escape") {
        e.preventDefault();
        onClose();
      }
    });
    return off;
  }, [appEmitter, onClose]);

  const addTitleSlide = useCallback(() => {
    setSlides((prev) => [
      {
        id: crypto.randomUUID(),
        entry: prev[0]?.entry,
        text: project.name,
        duration: 3,
      },
      ...prev,
    ]);
  }, [project.name]);

  const updateSlide = useCallback((id: string, patch: Partial<SlideItem>) => {
    setSlides((prev) =>
      prev.map((s) => (s.id === id ? { ...s, ...patch } : s)),
    );
  }, []);

  const removeSlide = useCallback((id: string) => {
    setSlides((prev) => prev.filter((s) => s.id !== id));
  }, []);

  const moveSlide = useCallback((fromIdx: number, direction: -1 | 1) => {
    setSlides((prev) => {
      const toIdx = fromIdx + direction;
      if (toIdx < 0 || toIdx >= prev.length) return prev;
      const copy = [...prev];
      [copy[fromIdx], copy[toIdx]] = [copy[toIdx], copy[fromIdx]];
      return copy;
    });
  }, []);

  return (
    <div style={pageStyle}>
      {/* Sidebar */}
      <div style={sidebarStyle}>
        <h3 style={{ margin: "0 0 12px" }}>{project.name}</h3>

        <label style={labelStyle}>{t("Transition")}</label>
        <select
          value={transition}
          onChange={(e) => setTransition(e.target.value as TransitionType)}
          style={selectStyle}
        >
          <option value="fade">Fade</option>
          <option value="slide">Slide</option>
          <option value="zoom">Zoom</option>
          <option value="none">{t("None")}</option>
        </select>

        <label style={labelStyle}>{t("Duration")} (s)</label>
        <input
          type="number"
          value={delay}
          min={0}
          max={5}
          step={0.1}
          onChange={(e) => setDelay(Number(e.target.value))}
          style={inputStyle}
        />

        <label style={labelStyle}>Format</label>
        <select
          value={format}
          onChange={(e) => setFormat(e.target.value as OutputFormat)}
          style={selectStyle}
        >
          <option value="mp4">MP4</option>
          <option value="webm">WebM</option>
        </select>

        <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 8 }}>
          <button style={buttonStyle} onClick={addTitleSlide}>
            {t("Add Title")}
          </button>
          <button style={buttonStyle} onClick={() => {}}>
            {t("Generate Slideshow")}
          </button>
        </div>

        <div style={{ marginTop: "auto", fontSize: 12, opacity: 0.6 }}>
          {slides.length} slides
        </div>
      </div>

      {/* Slide list */}
      <div style={listContainerStyle}>
        {slides.map((slide, idx) => (
          <div key={slide.id} style={slideRowStyle}>
            {slide.entry && (
              <img
                src={thumbnailUrl(slide.entry, "th-small")}
                alt={slide.entry.name}
                style={slideThumbStyle}
              />
            )}
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
              <input
                type="text"
                value={slide.text}
                placeholder={slide.entry?.name ?? t("Text")}
                onChange={(e) => updateSlide(slide.id, { text: e.target.value })}
                style={inputStyle}
              />
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 11, opacity: 0.6 }}>{t("Duration")}</span>
                <input
                  type="range"
                  min={1}
                  max={15}
                  step={0.5}
                  value={slide.duration}
                  onChange={(e) =>
                    updateSlide(slide.id, { duration: Number(e.target.value) })
                  }
                  style={{ flex: 1 }}
                />
                <span style={{ fontSize: 11, width: 30, textAlign: "right" }}>
                  {slide.duration}s
                </span>
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <button
                style={smallBtnStyle}
                disabled={idx === 0}
                onClick={() => moveSlide(idx, -1)}
              >
                &#x25B2;
              </button>
              <button
                style={smallBtnStyle}
                disabled={idx === slides.length - 1}
                onClick={() => moveSlide(idx, 1)}
              >
                &#x25BC;
              </button>
              <button style={smallBtnStyle} onClick={() => removeSlide(slide.id)}>
                &times;
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const pageStyle: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  display: "flex",
  background: "#1a1a1a",
  color: "#ddd",
  overflow: "hidden",
};

const sidebarStyle: React.CSSProperties = {
  width: 220,
  padding: 16,
  display: "flex",
  flexDirection: "column",
  gap: 6,
  borderRight: "1px solid #333",
  flexShrink: 0,
  overflowY: "auto",
};

const listContainerStyle: React.CSSProperties = {
  flex: 1,
  overflowY: "auto",
  padding: 12,
  display: "flex",
  flexDirection: "column",
  gap: 8,
};

const slideRowStyle: React.CSSProperties = {
  display: "flex",
  gap: 10,
  alignItems: "center",
  background: "#252525",
  padding: 8,
  borderRadius: 4,
};

const slideThumbStyle: React.CSSProperties = {
  width: 72,
  height: 54,
  objectFit: "cover",
  borderRadius: 3,
  flexShrink: 0,
};

const labelStyle: React.CSSProperties = {
  fontSize: 12,
  marginTop: 8,
  opacity: 0.7,
};

const selectStyle: React.CSSProperties = {
  width: "100%",
  padding: "4px 6px",
  background: "#2a2a2a",
  color: "#ddd",
  border: "1px solid #444",
  borderRadius: 3,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "4px 6px",
  background: "#2a2a2a",
  color: "#ddd",
  border: "1px solid #444",
  borderRadius: 3,
  boxSizing: "border-box",
};

const buttonStyle: React.CSSProperties = {
  padding: "6px 12px",
  background: "#3a3a3a",
  color: "#ddd",
  border: "1px solid #555",
  borderRadius: 3,
  cursor: "pointer",
};

const smallBtnStyle: React.CSSProperties = {
  background: "transparent",
  color: "#aaa",
  border: "none",
  cursor: "pointer",
  fontSize: 12,
  padding: "1px 4px",
  lineHeight: 1,
};
