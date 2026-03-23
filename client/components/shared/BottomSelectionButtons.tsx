import { useState, useEffect, useCallback, useMemo } from "react";
import {
  usePicisaService,
  useAppEmitter,
} from "../../context/AppContext";
import {
  useSettings,
  useUpdateSettings,
} from "../../context/SettingsProvider";
import { thumbnailUrl, albumEntryMetadata } from "../../imageProcess/client";
import { t } from "../strings";
import type { AlbumEntry } from "../../../shared/types/types";
import type { MetaPage } from "./MetadataViewer";

interface BottomSelectionButtonsProps {
  selected: AlbumEntry[];
  activeEntry: AlbumEntry | null;
  activeIndex: number;
  onMetaPageChange: (page: MetaPage | null) => void;
}

export function BottomSelectionButtons({
  selected,
  activeEntry,
  activeIndex,
  onMetaPageChange,
}: BottomSelectionButtonsProps) {
  const service = usePicisaService();
  const appEmitter = useAppEmitter();
  const settings = useSettings();
  const updateSettings = useUpdateSettings();
  const [info, setInfo] = useState("");
  const [starLabel, setStarLabel] = useState("☆");
  const [metaPageIdx, setMetaPageIdx] = useState(-1);

  const metaPages: MetaPage[] = useMemo(() => ["metadata", "location", "persons"], []);

  useEffect(() => {
    if (!activeEntry) {
      setInfo("");
      setStarLabel("☆");
      return;
    }
    let cancelled = false;
    albumEntryMetadata(activeEntry).then((meta) => {
      if (cancelled) return;
      const stars = parseInt(meta?.starCount || "0");
      setStarLabel(stars ? "🌟".repeat(stars) : "☆");
      let text = `${activeEntry.album.name} > ${activeEntry.name}   `;
      if (meta?.dateTaken) {
        text += `    ${new Date(meta.dateTaken).toLocaleString(undefined, {
          weekday: "long",
          year: "numeric",
          month: "numeric",
          day: "numeric",
          hour: "numeric",
          minute: "numeric",
          second: "numeric",
        })}`;
      }
      if (meta?.dimensions) text += `    ${meta.dimensions} pixels`;
      if (activeIndex !== -1)
        text += ` (${activeIndex + 1} ${t("of")} ${selected.length})`;
      setInfo(text);
    });
    return () => { cancelled = true; };
  }, [activeEntry, activeIndex, selected.length]);

  const handleZoom = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      updateSettings({ iconSize: Number(e.target.value) });
    },
    [updateSettings],
  );

  const rotateLeft = useCallback(async () => {
    if (!service || selected.length === 0) return;
    service.rotate(selected, "left");
  }, [service, selected]);

  const rotateRight = useCallback(async () => {
    if (!service || selected.length === 0) return;
    service.rotate(selected, "right");
  }, [service, selected]);

  const handleAddStar = useCallback(async () => {
    if (!service || selected.length === 0) return;
    await service.addStar(selected);
  }, [service, selected]);

  const handleExport = useCallback(async () => {
    if (!service || selected.length === 0) return;
    service.createJob("export" as any, { source: selected });
  }, [service, selected]);

  const handleDuplicate = useCallback(async () => {
    if (!service || selected.length === 0) return;
    service.createJob("duplicate" as any, { source: selected });
  }, [service, selected]);

  const handleMosaic = useCallback(() => {
    if (selected.length === 0) return;
    appEmitter.emit("mosaic", { initialList: selected });
  }, [appEmitter, selected]);

  const handleSlideshow = useCallback(() => {
    if (selected.length === 0) return;
    appEmitter.emit("slideshow", { initialList: selected });
  }, [appEmitter, selected]);

  const handleDelete = useCallback(async () => {
    if (!service || selected.length === 0) return;
    const label =
      selected.length === 1
        ? t(`Do you want to delete the file $1|${selected[0].name}`)
        : t(`Do you want to delete $1 files|${selected.length}`);
    if (confirm(label)) {
      service.createJob("delete" as any, { source: selected });
    }
  }, [service, selected]);

  const handleOpenInFinder = useCallback(async () => {
    if (!service || !activeEntry) return;
    service.openEntryInFinder(activeEntry);
  }, [service, activeEntry]);

  const toggleMetaPage = useCallback(
    (idx: number) => {
      const newIdx = metaPageIdx === idx ? -1 : idx;
      setMetaPageIdx(newIdx);
      onMetaPageChange(newIdx === -1 ? null : metaPages[newIdx]);
    },
    [metaPageIdx, metaPages, onMetaPageChange],
  );

  const hasSelection = selected.length > 0;
  const metaLabels = ["≡", "📍", "👤"];

  return (
    <div className="bottom-list-tools">
      <div className="selection-info">{info}</div>

      <div className="selection-thumbs">
        <div className="selection-thumbs-icons">
          {selected.slice(0, 100).map((entry, idx) => (
            <div
              key={`${entry.album.key}/${entry.name}`}
              className={`selection-thumb entry${activeIndex === idx ? " selection-thumb-selected" : ""}`}
              style={{
                backgroundImage: `url(${thumbnailUrl(entry, "th-small")})`,
              }}
            />
          ))}
          <span className="selection-thumb-count">
            {selected.length} {t("photos selected")}
          </span>
        </div>
      </div>

      <div className="quick-actions picasa-button-group">
        <button
          type="button"
          className={`quick-actions-star${!hasSelection ? " disabled" : ""}`}
          disabled={!hasSelection}
          onClick={handleAddStar}
          title={t("Add star")}
        >
          {starLabel}
        </button>
        <button
          className={`quick-actions-rotate-left${!hasSelection ? " disabled" : ""}`}
          onClick={rotateLeft}
          disabled={!hasSelection}
          title={t("Rotate")}
        >
          ↺
        </button>
        <button
          className={`quick-actions-rotate-right${!hasSelection ? " disabled" : ""}`}
          onClick={rotateRight}
          disabled={!hasSelection}
          title={t("Rotate")}
        >
          ↻
        </button>
      </div>

      <div className="selection-actions-buttons">
        <button
          className={`selection-actions-button${!hasSelection ? " disabled" : ""}`}
          disabled={!hasSelection}
          onClick={handleExport}
          title={hasSelection ? t("Export $1 item(s)", selected.length) : ""}
        >
          {t("Export...")}
        </button>
        <span className="button-separator" />
        <button
          className={`selection-actions-button${!hasSelection ? " disabled" : ""}`}
          disabled={!hasSelection}
          onClick={handleDuplicate}
          title={hasSelection ? t("Duplicate $1 item(s)", selected.length) : ""}
        >
          {t("Duplicate")}
        </button>
        <button
          className={`selection-actions-button${!hasSelection ? " disabled" : ""}`}
          disabled={!hasSelection}
          onClick={handleMosaic}
        >
          {t("Mosaic")}
        </button>
        <button
          className={`selection-actions-button${!hasSelection ? " disabled" : ""}`}
          disabled={!hasSelection}
          onClick={handleSlideshow}
        >
          {t("Slideshow")}
        </button>
        <span className="button-separator" />
        <button
          className={`selection-actions-button${!activeEntry ? " disabled" : ""}`}
          disabled={!activeEntry}
          onClick={handleOpenInFinder}
        >
          {t("Finder")}
        </button>
        <button
          className={`selection-actions-button${!hasSelection ? " disabled" : ""}`}
          disabled={!hasSelection}
          onClick={handleDelete}
        >
          {t("Delete")}
        </button>
      </div>

      <div className="zoom-photo-list">
        <label>⛰</label>
        <input
          type="range"
          min={75}
          max={250}
          value={settings.iconSize}
          onChange={handleZoom}
          className="photos-zoom-ctrl"
        />
      </div>

      <div className="metadata-modes">
        {metaLabels.map((label, idx) => (
          <button
            key={idx}
            className={`metadata-mode-btn${metaPageIdx === idx ? " active" : ""}`}
            onClick={() => toggleMetaPage(idx)}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
