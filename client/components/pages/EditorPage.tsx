import { useState, useEffect, useRef, useCallback } from "react";
import type { AlbumEntry } from "../../../shared/types/types";
import { isVideo } from "../../../shared/lib/utils";
import { usePicisaService, useAppEmitter } from "../../context/AppContext";
import { useAlbumEntries } from "../../context/caches/AlbumEntriesCacheProvider";
import { useCacheBust } from "../../context/CacheBustProvider";
import { assetUrl, thumbnailUrl } from "../../imageProcess/client";
import { toggleStar } from "../../lib/handles";
import { t } from "../strings";
import { Button } from "../controls";

interface EditorPageProps {
  entry: AlbumEntry;
  onClose?: () => void;
}

const toolCategories = [
  {
    name: "Basic",
    icon: "resources/images/wrench.svg",
    tools: [
      { name: t("Crop"), icon: "resources/images/wrench.svg" },
      { name: t("Tilt"), icon: "resources/images/wrench.svg" },
      { name: t("Rotate Left"), icon: "resources/images/wrench.svg" },
      { name: t("Rotate Right"), icon: "resources/images/wrench.svg" },
      { name: t("Flip"), icon: "resources/images/wrench.svg" },
      { name: t("Mirror"), icon: "resources/images/wrench.svg" },
    ],
  },
  {
    name: t("Adjustments"),
    icon: "resources/images/contrast.svg",
    tools: [
      { name: t("Brightness"), icon: "resources/images/contrast.svg" },
      { name: t("Contrast"), icon: "resources/images/contrast.svg" },
      { name: t("Highlights"), icon: "resources/images/contrast.svg" },
      { name: t("Extra Light"), icon: "resources/images/contrast.svg" },
    ],
  },
  {
    name: t("Effects"),
    icon: "resources/images/brush.svg",
    tools: [
      { name: t("Autocolor"), icon: "resources/images/brush.svg" },
      { name: t("Greyscale"), icon: "resources/images/brush.svg" },
      { name: t("Sepia"), icon: "resources/images/brush.svg" },
      { name: t("Polaroid"), icon: "resources/images/brush.svg" },
    ],
  },
  {
    name: t("More..."),
    icon: "resources/images/green-brush.svg",
    tools: [
      { name: t("Blur"), icon: "resources/images/green-brush.svg" },
      { name: t("Sharpen"), icon: "resources/images/green-brush.svg" },
      { name: t("Heatmap"), icon: "resources/images/green-brush.svg" },
      { name: t("Solarize"), icon: "resources/images/green-brush.svg" },
    ],
  },
  {
    name: t("Filters"),
    icon: "resources/images/blue-brush.svg",
    tools: [{ name: t("Filter"), icon: "resources/images/blue-brush.svg" }],
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

  useEffect(() => {
    setEntry(initialEntry);
  }, [initialEntry]);

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
                  onClick={() => {
                    /* TODO: activate tool */
                  }}
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
          {t("Histogram data and informations about the camera")}
          <div className="histogram-camera-model" />
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
              src="resources/images/thinking.gif"
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
