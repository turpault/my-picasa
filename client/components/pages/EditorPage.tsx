import { useState, useEffect, useRef, useCallback } from "react";
import type { AlbumEntry } from "../../../shared/types/types";
import { isVideo, decodeOperations, encodeOperations } from "../../../shared/lib/utils";
import { usePicisaService, useAppEmitter } from "../../context/AppContext";
import { useAlbumEntries } from "../../context/caches/AlbumEntriesCacheProvider";
import { useCacheBust } from "../../context/CacheBustProvider";
import { assetUrl, thumbnailUrl, buildContext, destroyContext } from "../../imageProcess/client";
import { toggleStar } from "../../lib/handles";
import { t } from "../strings";
import { Button } from "../controls";
import { Histogram } from "../shared/Histogram";

interface EditorPageProps {
  entry: AlbumEntry;
  onClose?: () => void;
}

const RES = "/resources/images";

const toolCategories = [
  {
    name: "Basic",
    icon: `${RES}/wrench.svg`,
    tools: [
      { name: t("Crop"), icon: `${RES}/wrench.svg`, filterName: "crop64" },
      { name: t("Tilt"), icon: `${RES}/wrench.svg`, filterName: "tilt" },
      { name: t("Rotate Left"), icon: `${RES}/wrench.svg`, action: "rotateLeft" },
      { name: t("Rotate Right"), icon: `${RES}/wrench.svg`, action: "rotateRight" },
      { name: t("Flip"), icon: `${RES}/wrench.svg`, filterName: "flip" },
      { name: t("Mirror"), icon: `${RES}/wrench.svg`, filterName: "mirror" },
    ],
  },
  {
    name: t("Adjustments"),
    icon: `${RES}/contrast.svg`,
    tools: [
      { name: t("Brightness"), icon: `${RES}/contrast.svg`, filterName: "finetune2" },
      { name: t("Contrast"), icon: `${RES}/contrast.svg`, filterName: "finetune2" },
      { name: t("Highlights"), icon: `${RES}/contrast.svg`, filterName: "finetune2" },
      { name: t("Extra Light"), icon: `${RES}/contrast.svg`, filterName: "autolight" },
    ],
  },
  {
    name: t("Effects"),
    icon: `${RES}/brush.svg`,
    tools: [
      { name: t("Autocolor"), icon: `${RES}/brush.svg`, filterName: "autocolor" },
      { name: t("Greyscale"), icon: `${RES}/brush.svg`, filterName: "greyscale" },
      { name: t("Sepia"), icon: `${RES}/brush.svg`, filterName: "sepia" },
      { name: t("Polaroid"), icon: `${RES}/brush.svg`, filterName: "polaroid" },
    ],
  },
  {
    name: t("More..."),
    icon: `${RES}/green-brush.svg`,
    tools: [
      { name: t("Blur"), icon: `${RES}/green-brush.svg`, filterName: "blur" },
      { name: t("Sharpen"), icon: `${RES}/green-brush.svg`, filterName: "sharpen" },
      { name: t("Heatmap"), icon: `${RES}/green-brush.svg`, filterName: "heatmap" },
      { name: t("Solarize"), icon: `${RES}/green-brush.svg`, filterName: "solarize" },
    ],
  },
  {
    name: t("Filters"),
    icon: `${RES}/blue-brush.svg`,
    tools: [{ name: t("Filter"), icon: `${RES}/blue-brush.svg`, filterName: "filter" }],
  },
];

function EditorHeader({
  entry,
  entries,
  onSelect,
}: {
  entry: AlbumEntry;
  entries: AlbumEntry[];
  onSelect: (e: AlbumEntry) => void;
}) {
  const appEmitter = useAppEmitter();
  const cacheBust = useCacheBust();
  const stripRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = stripRef.current;
    if (!el) return;
    const active = el.querySelector(".strip-thumb.active");
    active?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  }, [entry.name, entry.album.key]);

  return (
    <div className="editor-header">
      <Button
        className="editor-back-button"
        onClick={() => {
          appEmitter.emit("returnToBrowser", undefined);
        }}
      >
        {t("Back to Photo Library")}
      </Button>
      <div className="editor-strip" ref={stripRef}>
        {entries.map((e) => {
          const active =
            e.name === entry.name && e.album.key === entry.album.key;
          return (
            <img
              key={e.album.key + "/" + e.name}
              className={`strip-thumb${active ? " active" : ""}`}
              src={thumbnailUrl(e, "th-small", false) + `&cb=${cacheBust(e)}`}
              onClick={() => onSelect(e)}
              draggable={false}
            />
          );
        })}
      </div>
    </div>
  );
}

export function EditorPage({ entry: initialEntry, onClose }: EditorPageProps) {
  const [entry, setEntry] = useState(initialEntry);
  const [activeTab, setActiveTab] = useState(0);
  const [starred, setStarred] = useState(false);
  const [undoStack, setUndoStack] = useState<string[]>([]);
  const [redoStack, setRedoStack] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const service = usePicisaService();
  const cacheBust = useCacheBust();
  const { entries } = useAlbumEntries(entry.album);

  const videoRef = useRef<HTMLVideoElement>(null);
  const entryIsVideo = isVideo(entry);

  const [histogramContext, setHistogramContext] = useState<string | null>(null);
  const histogramContextRef = useRef<string | null>(null);

  useEffect(() => {
    setEntry(initialEntry);
  }, [initialEntry]);

  useEffect(() => {
    if (entryIsVideo) {
      setHistogramContext(null);
      histogramContextRef.current = null;
      return;
    }
    let cancelled = false;
    buildContext(entry)
      .then((ctx) => {
        if (cancelled) {
          destroyContext(ctx);
        } else {
          histogramContextRef.current = ctx;
          setHistogramContext(ctx);
        }
      })
      .catch(() => {
        if (!cancelled) setHistogramContext(null);
      });
    return () => {
      cancelled = true;
      const toDestroy = histogramContextRef.current;
      histogramContextRef.current = null;
      setHistogramContext(null);
      if (toDestroy) destroyContext(toDestroy);
    };
  }, [entry.album.key, entry.name, entryIsVideo]);

  useEffect(() => {
    if (!service) return;
    service.getAlbumEntryMetadata(entry).then((meta) => {
      setStarred(!!meta?.star);
    });
  }, [service, entry.name, entry.album.key]);

  const handleToggleStar = useCallback(async () => {
    await toggleStar([entry]);
    setStarred((s) => !s);
  }, [entry]);

  const handleSelectEntry = useCallback((e: AlbumEntry) => {
    setEntry(e);
  }, []);

  const handleToolClick = useCallback(
    async (tool: { action?: string; filterName?: string }) => {
      if (!service || entryIsVideo) return;
      setBusy(true);
      try {
        if (tool.action === "rotateLeft") {
          await service.rotate([entry], "left");
        } else if (tool.action === "rotateRight") {
          await service.rotate([entry], "right");
        } else if (tool.filterName && ["flip", "mirror"].includes(tool.filterName)) {
          const meta = await service.getAlbumEntryMetadata(entry);
          const current = decodeOperations(meta?.filters || "");
          const idx = current.findIndex((o) => o.name === tool.filterName);
          const next =
            idx >= 0
              ? current.filter((_, i) => i !== idx)
              : [...current, { name: tool.filterName!, args: ["1"] }];
          await service.setFilters(entry, encodeOperations(next));
        }
      } finally {
        setBusy(false);
      }
    },
    [service, entry, entryIsVideo],
  );

  const imgSrc = assetUrl(entry) + `?cb=${cacheBust(entry)}`;

  return (
    <div className="fill editor-page">
      <EditorHeader
        entry={entry}
        entries={entries}
        onSelect={handleSelectEntry}
      />

      <div className="fill tools">
        <div className="tools-tab-bar">
          {toolCategories.map((cat, idx) => (
            <button
              key={cat.name}
              className={`tools-tab-button${idx === activeTab ? " active" : ""}`}
              onClick={() => setActiveTab(idx)}
            >
              <img src={cat.icon} alt={cat.name} className="tools-tab-icon" />
            </button>
          ))}
        </div>

        <div className="tools-tab-contents">
          {toolCategories.map((cat, idx) => (
            <div
              key={cat.name}
              className="tools-tab-page"
              style={{ display: idx === activeTab ? "flex" : "none" }}
            >
              {cat.tools.map((tool) => (
                <Button
                  key={tool.name}
                  icon={tool.icon}
                  iconPos="top"
                  className="tool-button"
                  onClick={() => handleToolClick(tool)}
                >
                  {tool.name}
                </Button>
              ))}
            </div>
          ))}
        </div>

        <div className="tools-bar-undo-redo">
          <Button
            className="tools-bar-undo-redo-button"
            disabled={undoStack.length === 0}
            onClick={() => {
              /* TODO: undo */
            }}
          >
            {t("Undo")}
          </Button>
          <Button
            className="tools-bar-undo-redo-button"
            disabled={redoStack.length === 0}
            onClick={() => {
              /* TODO: redo */
            }}
          >
            {t("Redo")}
          </Button>
        </div>

        <div className="editor-controls" />

        <div className="histogram">
          {t("Histogram data and information about the camera")}
          <Histogram context={histogramContext} />
        </div>
      </div>

      <div className="image-container">
        {entryIsVideo ? (
          <video
            ref={videoRef}
            className="edited-video"
            src={imgSrc}
            autoPlay
            muted
            loop
            controls
          />
        ) : (
          <img
            className="fill-with-aspect edited-image"
            src={imgSrc}
            draggable={false}
          />
        )}

        {busy && (
          <div className="busy-spinner w3-display-container fill">
            <img
              src={`${RES}/thinking.gif`}
              className="w3-display-middle"
            />
          </div>
        )}

        <div
          className={`star big-star${starred ? " starred" : ""}`}
          onClick={handleToggleStar}
        />
      </div>
    </div>
  );
}
