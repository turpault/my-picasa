import { useCallback, useEffect, useState } from "react";
import type { AlbumEntry } from "../../../shared/types/types";
import { thumbnailUrl } from "../../imageProcess/client";
import { useAppEmitter, usePicisaService } from "../../context/AppContext";
import { t } from "../strings";

interface MosaicPageProps {
  project: { name: string; entries: AlbumEntry[] };
  onClose: () => void;
}

type Orientation = "paysage" | "portrait" | "square";
type GutterSize = "none" | "small" | "medium" | "large";

export function MosaicPage({ project, onClose }: MosaicPageProps) {
  const appEmitter = useAppEmitter();
  const service = usePicisaService();
  const [entries, setEntries] = useState(project.entries);
  const [orientation, setOrientation] = useState<Orientation>("paysage");
  const [gutterSize, setGutterSize] = useState<GutterSize>("small");
  const [targetSize, setTargetSize] = useState(2048);

  useEffect(() => {
    const off = appEmitter.on("keyDown", (e) => {
      if (e.code === "Escape") {
        e.preventDefault();
        onClose();
      }
    });
    return off;
  }, [appEmitter, onClose]);

  const shuffle = useCallback(() => {
    setEntries((prev) => {
      const copy = [...prev];
      for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
      }
      return copy;
    });
  }, []);

  const gutterPx =
    gutterSize === "none" ? 0 : gutterSize === "small" ? 2 : gutterSize === "medium" ? 4 : 8;

  const columns = orientation === "portrait" ? 3 : orientation === "square" ? 4 : 5;

  return (
    <div style={pageStyle}>
      {/* Sidebar */}
      <div style={sidebarStyle}>
        <h3 style={{ margin: "0 0 12px" }}>{project.name}</h3>

        <label style={labelStyle}>{t("Orientation")}</label>
        <select
          value={orientation}
          onChange={(e) => setOrientation(e.target.value as Orientation)}
          style={selectStyle}
        >
          <option value="paysage">{t("Paysage")}</option>
          <option value="portrait">{t("Portrait")}</option>
          <option value="square">{t("Square")}</option>
        </select>

        <label style={labelStyle}>{t("Target Size")}</label>
        <select
          value={targetSize}
          onChange={(e) => setTargetSize(Number(e.target.value))}
          style={selectStyle}
        >
          <option value={1024}>1024</option>
          <option value={2048}>2048</option>
          <option value={4096}>4096</option>
        </select>

        <label style={labelStyle}>{t("Gutter Size")}</label>
        <select
          value={gutterSize}
          onChange={(e) => setGutterSize(e.target.value as GutterSize)}
          style={selectStyle}
        >
          <option value="none">{t("None")}</option>
          <option value="small">{t("Small")}</option>
          <option value="medium">{t("Medium")}</option>
          <option value="large">{t("Large")}</option>
        </select>

        <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 8 }}>
          <button style={buttonStyle} onClick={shuffle}>
            {t("Shuffle")}
          </button>
          <button style={buttonStyle} onClick={() => {}}>
            {t("Make Image")}
          </button>
        </div>

        <div style={{ marginTop: "auto", fontSize: 12, opacity: 0.6 }}>
          {entries.length} {t("pictures")}
        </div>
      </div>

      {/* Mosaic grid */}
      <div style={gridContainerStyle}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: `repeat(${columns}, 1fr)`,
            gap: gutterPx,
            padding: gutterPx,
          }}
        >
          {entries.map((entry) => (
            <div
              key={`${entry.album.key}/${entry.name}`}
              style={{
                aspectRatio: "1",
                backgroundImage: `url(${thumbnailUrl(entry, "th-medium")})`,
                backgroundSize: "cover",
                backgroundPosition: "center",
                borderRadius: 2,
              }}
            />
          ))}
        </div>
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

const gridContainerStyle: React.CSSProperties = {
  flex: 1,
  overflowY: "auto",
  padding: 8,
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

const buttonStyle: React.CSSProperties = {
  padding: "6px 12px",
  background: "#3a3a3a",
  color: "#ddd",
  border: "1px solid #555",
  borderRadius: 3,
  cursor: "pointer",
};
