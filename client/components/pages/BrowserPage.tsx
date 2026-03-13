import React, { useCallback, useMemo, useState } from "react";
import type {
  Album,
  AlbumEntry,
  AlbumEntryWithMetadata,
  AlbumWithData,
  Filters,
  Shortcut,
} from "../../../shared/types/types";
import { ProjectType, personKeyFromName } from "../../../shared/types/types";
import { isPicture } from "../../../shared/lib/utils";
import { useAlbums } from "../../context/caches/AlbumsCacheProvider";
import { useShortcuts } from "../../context/caches/ShortcutsCacheProvider";
import { useContacts } from "../../context/caches/ContactsCacheProvider";
import { useProjects } from "../../context/caches/ProjectsCacheProvider";
import { useAlbumEntries } from "../../context/caches/AlbumEntriesCacheProvider";
import {
  useSettings,
  useUpdateSettings,
  useUpdateFilter,
} from "../../context/SettingsProvider";
import { useAppEmitter } from "../../context/AppContext";
import { useCacheBust } from "../../context/CacheBustProvider";
import { thumbnailUrl } from "../../imageProcess/client";
import { t } from "../strings";

// ---------------------------------------------------------------------------
// Thumbnail
// ---------------------------------------------------------------------------

interface ThumbnailProps {
  entry: AlbumEntryWithMetadata;
  isSelected: boolean;
  onSelect: (e: React.MouseEvent) => void;
  onDoubleClick: () => void;
}

function Thumbnail({
  entry,
  isSelected,
  onSelect,
  onDoubleClick,
}: ThumbnailProps) {
  const cacheBust = useCacheBust();
  const url = thumbnailUrl(entry, "th-medium") + `&cb=${cacheBust(entry)}`;

  const handleDragStart = useCallback(
    (e: React.DragEvent) => {
      e.dataTransfer.setData(
        "application/json",
        JSON.stringify({ entry: { name: entry.name, album: entry.album } }),
      );
      e.dataTransfer.effectAllowed = "move";
    },
    [entry],
  );

  return (
    <div
      className={`thumbnail${isSelected ? " selected" : ""}`}
      onClick={onSelect}
      onDoubleClick={onDoubleClick}
      draggable
      onDragStart={handleDragStart}
    >
      <img src={url} loading="lazy" alt={entry.name} />
      {entry.meta?.starCount && (
        <span className="star-overlay">{"★".repeat(Number(entry.meta.starCount) || 0)}</span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// PhotoList
// ---------------------------------------------------------------------------

interface PhotoListProps {
  album: Album | null;
}

function PhotoList({ album }: PhotoListProps) {
  const settings = useSettings();
  const { entries, loading } = useAlbumEntries(album, settings.filters);
  const appEmitter = useAppEmitter();
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const entryKey = useCallback(
    (e: AlbumEntry) => `${e.album.key}/${e.name}`,
    [],
  );

  const handleSelect = useCallback(
    (entry: AlbumEntryWithMetadata, e: React.MouseEvent) => {
      const key = entryKey(entry);

      if (e.metaKey || e.ctrlKey) {
        setSelected((prev) => {
          const next = new Set(prev);
          if (next.has(key)) next.delete(key);
          else next.add(key);
          return next;
        });
      } else if (e.shiftKey && entries.length > 0) {
        const keys = entries.map(entryKey);
        const lastSelected = [...selected].pop();
        const lastIdx = lastSelected ? keys.indexOf(lastSelected) : 0;
        const curIdx = keys.indexOf(key);
        const [start, end] = lastIdx <= curIdx ? [lastIdx, curIdx] : [curIdx, lastIdx];
        setSelected(new Set(keys.slice(start, end + 1)));
      } else {
        setSelected(new Set([key]));
      }
    },
    [entries, selected, entryKey],
  );

  const handleDoubleClick = useCallback(
    (entry: AlbumEntryWithMetadata) => {
      appEmitter.emit("edit", { entry });
    },
    [appEmitter],
  );

  if (!album) {
    return (
      <div className="images-area">
        <p className="placeholder">{t("Select an album")}</p>
      </div>
    );
  }

  return (
    <div className="images-area">
      {loading && <div className="loading-indicator">{t("Loading…")}</div>}
      <div className="album-header">
        <h2>{album.name}</h2>
        <span className="entry-count">{entries.length}</span>
      </div>
      <div className="photo-grid">
        {entries.map((entry) => (
          <Thumbnail
            key={entryKey(entry)}
            entry={entry}
            isSelected={selected.has(entryKey(entry))}
            onSelect={(e) => handleSelect(entry, e)}
            onDoubleClick={() => handleDoubleClick(entry)}
          />
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// AlbumList
// ---------------------------------------------------------------------------

interface AlbumListProps {
  selectedAlbum: Album | null;
  onSelectAlbum: (album: Album) => void;
}

function AlbumList({ selectedAlbum, onSelectAlbum }: AlbumListProps) {
  const albums = useAlbums();
  const shortcuts = useShortcuts();
  const contacts = useContacts();
  const mosaicProjects = useProjects(ProjectType.MOSAIC);
  const slideshowProjects = useProjects(ProjectType.SLIDESHOW);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const toggleSection = useCallback((section: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(section)) next.delete(section);
      else next.add(section);
      return next;
    });
  }, []);

  const albumsByYear = useMemo(() => {
    const groups = new Map<string, AlbumWithData[]>();
    for (const a of albums) {
      const year = a.lastModified
        ? new Date(a.lastModified).getFullYear().toString()
        : t("Unknown date");
      if (!groups.has(year)) groups.set(year, []);
      groups.get(year)!.push(a);
    }
    return new Map([...groups.entries()].sort((a, b) => b[0].localeCompare(a[0])));
  }, [albums]);

  const handleDrop = useCallback(
    (album: Album, e: React.DragEvent) => {
      e.preventDefault();
      try {
        const data = JSON.parse(e.dataTransfer.getData("application/json"));
        if (data?.entry) {
          // Drag-and-drop move would be handled by the service layer
        }
      } catch {
        // ignore bad payloads
      }
    },
    [],
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }, []);

  const renderAlbumItem = (album: Album, extra?: string) => (
    <div
      key={album.key}
      className={`album-item${selectedAlbum?.key === album.key ? " selected" : ""}`}
      onClick={() => onSelectAlbum(album)}
      onDrop={(e) => handleDrop(album, e)}
      onDragOver={handleDragOver}
    >
      <span className="album-name">{album.name}</span>
      {extra && <span className="album-extra">{extra}</span>}
    </div>
  );

  const renderSection = (
    key: string,
    title: string,
    children: React.ReactNode,
  ) => {
    const isCollapsed = collapsed.has(key);
    return (
      <div className="album-section" key={key}>
        <div
          className="album-section-header"
          onClick={() => toggleSection(key)}
        >
          <span className={`collapse-arrow${isCollapsed ? " collapsed" : ""}`}>
            ▶
          </span>
          <span>{title}</span>
        </div>
        {!isCollapsed && <div className="album-section-body">{children}</div>}
      </div>
    );
  };

  return (
    <div className="folder-pane">
      {shortcuts.length > 0 &&
        renderSection(
          "shortcuts",
          t("Shortcut"),
          shortcuts.map((s) =>
            renderAlbumItem(s.album, `⌨ ${s.shortcut}`),
          ),
        )}

      {[...albumsByYear.entries()].map(([year, yearAlbums]) =>
        renderSection(
          `year-${year}`,
          year,
          yearAlbums.map((a) => renderAlbumItem(a, `(${a.count})`)),
        ),
      )}

      {(mosaicProjects.length > 0 || slideshowProjects.length > 0) &&
        renderSection(
          "projects",
          t("Mosaic"),
          <>
            {mosaicProjects.map((p) => (
              <div key={p.name} className="album-item project-item">
                <span className="album-name">{p.name}</span>
              </div>
            ))}
            {slideshowProjects.map((p) => (
              <div key={p.name} className="album-item project-item">
                <span className="album-name">{p.name}</span>
              </div>
            ))}
          </>,
        )}

      {contacts.length > 0 &&
        renderSection(
          "persons",
          t("Persons"),
          contacts.map((c) =>
            renderAlbumItem(
              { name: c.name, key: personKeyFromName(c.name) },
              "",
            ),
          ),
        )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// BrowserHeader
// ---------------------------------------------------------------------------

function BrowserHeader() {
  const settings = useSettings();
  const updateFilter = useUpdateFilter();
  const { filters } = settings;

  const starButtons = [0, 1, 2, 3] as const;

  return (
    <div className="browser-header">
      <div className="filter-group stars">
        {starButtons.map((n) => (
          <button
            key={n}
            className={`filter-btn${filters.star === n ? " active" : ""}`}
            onClick={() => updateFilter("star", n)}
            title={n === 0 ? t("All") : `${n}+ ★`}
          >
            {n === 0 ? t("All") : "★".repeat(n)}
          </button>
        ))}
      </div>

      <div className="filter-group toggles">
        <button
          className={`filter-btn${filters.video ? " active" : ""}`}
          onClick={() => updateFilter("video", !filters.video)}
        >
          {t("Video")}
        </button>
        <button
          className={`filter-btn${filters.people ? " active" : ""}`}
          onClick={() => updateFilter("people", !filters.people)}
        >
          {t("People")}
        </button>
        <button
          className={`filter-btn${filters.location ? " active" : ""}`}
          onClick={() => updateFilter("location", !filters.location)}
        >
          {t("Location")}
        </button>
        <button
          className={`filter-btn${filters.isFavoriteInIPhoto ? " active" : ""}`}
          onClick={() =>
            updateFilter("isFavoriteInIPhoto", !filters.isFavoriteInIPhoto)
          }
        >
          {t("Favorite")}
        </button>
      </div>

      <div className="filter-group search">
        <input
          type="text"
          className="search-input"
          placeholder={t("Search")}
          value={filters.text}
          onChange={(e) => updateFilter("text", e.target.value)}
        />
      </div>

      <button className="btn new-album-btn">{t("New Album")}</button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// BrowserPage (default export)
// ---------------------------------------------------------------------------

export default function BrowserPage() {
  const [selectedAlbum, setSelectedAlbum] = useState<Album | null>(null);

  return (
    <div className="browser fill">
      <BrowserHeader />
      <div className="browser-navigator fill">
        <AlbumList
          selectedAlbum={selectedAlbum}
          onSelectAlbum={setSelectedAlbum}
        />
        <PhotoList album={selectedAlbum} />
      </div>
    </div>
  );
}
