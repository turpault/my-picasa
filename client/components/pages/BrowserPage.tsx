import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type {
  Album,
  AlbumEntry,
  AlbumEntryMetaData,
  AlbumEntryPicasa,
  AlbumWithData,
} from "../../../shared/types/types";
import { ProjectType, personKeyFromName } from "../../../shared/types/types";
import { events } from "../../../shared/server-events";
import { useAlbums } from "../../context/caches/AlbumsCacheProvider";
import { useShortcuts } from "../../context/caches/ShortcutsCacheProvider";
import { useContacts } from "../../context/caches/ContactsCacheProvider";
import { useProjects } from "../../context/caches/ProjectsCacheProvider";
import {
  useSettings,
  useUpdateFilter,
} from "../../context/SettingsProvider";
import { useAppEmitter, usePicisaService } from "../../context/AppContext";
import { useCacheBust } from "../../context/CacheBustProvider";
import { isFilterEmpty } from "../../lib/settings";
import { thumbnailUrl } from "../../imageProcess/client";
import { t } from "../strings";
import { BottomSelectionButtons } from "../shared/BottomSelectionButtons";
import { MetadataViewer, type MetaPage } from "../shared/MetadataViewer";

/** Extract year section from album name: "2025-01-15 Foo" → "2025", "0000 Bar" → "0000" */
function yearFromAlbumName(name: string): string {
  const match = name.match(/^(\d{4})/);
  if (match) {
    const year = parseInt(match[1], 10);
    if (year >= 1900 && year <= 2100) return year.toString();
    return "0000";
  }
  return "0000";
}

// ---------------------------------------------------------------------------
// Thumbnail
// ---------------------------------------------------------------------------

interface ThumbnailProps {
  entry: AlbumEntry;
  picasaData?: AlbumEntryMetaData;
  isSelected: boolean;
  onSelect: (e: React.MouseEvent) => void;
  onDoubleClick: () => void;
}

const Thumbnail = React.memo(function Thumbnail({
  entry,
  picasaData,
  isSelected,
  onSelect,
  onDoubleClick,
}: ThumbnailProps) {
  const cacheBust = useCacheBust();
  const url = thumbnailUrl(entry, "th-medium") + `&cb=${cacheBust(entry)}`;
  const containerRef = useRef<HTMLDivElement>(null);
  const [starInset, setStarInset] = useState({ top: 4, right: 4 });

  const onImgLoad = useCallback(
    (ev: React.SyntheticEvent<HTMLImageElement>) => {
      const thumb = ev.currentTarget;
      const ratio = thumb.naturalWidth / thumb.naturalHeight;
      const parent = containerRef.current;
      if (!parent) return;
      const parentSize = {
        width: parent.clientWidth,
        height: parent.clientHeight,
      };
      const pad = 4;
      const insetH = ratio > 1 ? 0 : (parentSize.width * (1 - ratio)) / 2;
      const insetV =
        ratio > 1 ? (parentSize.height * (1 - 1 / ratio)) / 2 : 0;
      setStarInset({ top: insetV + pad, right: insetH + pad });
    },
    [],
  );

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

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onDoubleClick();
      }
    },
    [onDoubleClick],
  );

  const showStar = !!picasaData?.star;

  return (
    <div
      ref={containerRef}
      role="button"
      tabIndex={0}
      aria-label={entry.name}
      className={`thumbnail${isSelected ? " selected" : ""}`}
      onClick={onSelect}
      onDoubleClick={onDoubleClick}
      onKeyDown={handleKeyDown}
      draggable
      onDragStart={handleDragStart}
    >
      <img
        src={url}
        loading="lazy"
        alt={entry.name}
        onLoad={onImgLoad}
      />
      {showStar ? (
        <div
          className="star"
          style={{
            top: starInset.top,
            right: starInset.right,
            bottom: "auto",
            width: `${20 * parseInt(picasaData!.starCount || "1", 10)}px`,
          }}
          aria-hidden
        />
      ) : null}
    </div>
  );
});

// ---------------------------------------------------------------------------
// ThumbnailSkeleton – placeholder while photo loads
// ---------------------------------------------------------------------------

function ThumbnailSkeleton() {
  return <div className="thumbnail thumbnail-skeleton" aria-hidden />;
}

// ---------------------------------------------------------------------------
// AlbumSection – one album's header + photo grid
// ---------------------------------------------------------------------------

interface AlbumSectionProps {
  album: AlbumWithData;
  entries: AlbumEntry[];
  loading: boolean;
  selected: Set<string>;
  onSelect: (entry: AlbumEntry, e: React.MouseEvent) => void;
  onDoubleClick: (entry: AlbumEntry) => void;
  headerRef: (el: HTMLDivElement | null) => void;
}

function AlbumSection({
  album,
  entries,
  loading,
  selected,
  onSelect,
  onDoubleClick,
  headerRef,
}: AlbumSectionProps) {
  const service = usePicisaService();
  const [metaByName, setMetaByName] = useState<
    Record<string, AlbumEntryMetaData>
  >({});

  const entryKey = useCallback(
    (e: AlbumEntry) => `${e.album.key}/${e.name}`,
    [],
  );

  const entryNamesKey = useMemo(
    () => entries.map((e) => e.name).join("\0"),
    [entries],
  );

  useEffect(() => {
    if (!service || entries.length === 0) {
      setMetaByName({});
      return;
    }
    let cancelled = false;
    service.getAlbumMetadata(album).then((raw) => {
      if (cancelled) return;
      const albumMeta = raw as Record<string, unknown>;
      const next: Record<string, AlbumEntryMetaData> = {};
      for (const e of entries) {
        const v = albumMeta[e.name];
        if (v && typeof v === "object" && !Array.isArray(v)) {
          next[e.name] = v as AlbumEntryMetaData;
        }
      }
      setMetaByName(next);
    });
    return () => {
      cancelled = true;
    };
  }, [service, album, entryNamesKey]);

  useEffect(() => {
    const applies = (entry: AlbumEntryPicasa) =>
      entry.album.key === album.key &&
      entries.some((e) => e.name === entry.name);

    const onFavorite = ({ entry }: { entry: AlbumEntryPicasa }) => {
      if (!applies(entry)) return;
      setMetaByName((prev) => ({ ...prev, [entry.name]: entry.metadata }));
    };

    const onPicasa = ({
      entry,
      field,
    }: {
      entry: AlbumEntryPicasa;
      field: string;
    }) => {
      if (field !== "star" && field !== "starCount") return;
      if (!applies(entry)) return;
      setMetaByName((prev) => ({ ...prev, [entry.name]: entry.metadata }));
    };

    const offFav = events.on("favoriteChanged", onFavorite);
    const offPic = events.on("picasaEntryUpdated", onPicasa);
    return () => {
      offFav();
      offPic();
    };
  }, [album.key, entries, entryNamesKey]);

  const skeletonCount = Math.min(album.count || 12, 48);

  return (
    <div className="album-stream-section">
      <div className="album-stream-header" ref={headerRef} data-album-key={album.key}>
        <h2>{album.name}</h2>
        <span className="entry-count">
          {loading && entries.length === 0 ? "…" : entries.length}
        </span>
      </div>
      {entries.length > 0 ? (
        <div className="photo-grid">
          {entries.map((entry) => (
            <Thumbnail
              key={entryKey(entry)}
              entry={entry}
              picasaData={metaByName[entry.name]}
              isSelected={selected.has(entryKey(entry))}
              onSelect={(e) => onSelect(entry, e)}
              onDoubleClick={() => onDoubleClick(entry)}
            />
          ))}
        </div>
      ) : loading ? (
        <div className="photo-grid">
          {Array.from({ length: skeletonCount }, (_, i) => (
            <ThumbnailSkeleton key={i} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// PhotoList – infinite scroll across albums
// ---------------------------------------------------------------------------

interface PhotoListProps {
  orderedAlbums: AlbumWithData[];
  selectedAlbum: Album | null;
  onVisibleAlbumChange: (album: Album) => void;
  onSelectionChange: (entries: AlbumEntry[], activeEntry: AlbumEntry | null, activeIndex: number) => void;
}

function PhotoList({
  orderedAlbums,
  selectedAlbum,
  onVisibleAlbumChange,
  onSelectionChange,
}: PhotoListProps) {
  const service = usePicisaService();
  const settings = useSettings();
  const appEmitter = useAppEmitter();

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [activeEntryKey, setActiveEntryKey] = useState<string | null>(null);

  // Map of album key → entries (loaded albums)
  const [entriesMap, setEntriesMap] = useState<Map<string, AlbumEntry[]>>(
    new Map(),
  );
  const [loadingSet, setLoadingSet] = useState<Set<string>>(new Set());
  // Which album keys are in the loaded window
  const [loadedKeys, setLoadedKeys] = useState<Set<string>>(new Set());

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const headerRefsMap = useRef<Map<string, HTMLDivElement>>(new Map());
  const mountedRef = useRef(true);

  // Fetch entries for a single album
  const fetchAlbumEntries = useCallback(
    async (album: Album) => {
      if (!service) return;
      const key = album.key;
      setLoadingSet((prev) => new Set(prev).add(key));
      try {
        const effectiveFilters = settings.filters
          ? isFilterEmpty(settings.filters)
          : undefined;
        const result = await service.media(album, effectiveFilters);
        if (!mountedRef.current) return;
        const list = Array.isArray(result) ? result : result?.entries ?? [];
        setEntriesMap((prev) => new Map(prev).set(key, list));
      } finally {
        if (mountedRef.current) {
          setLoadingSet((prev) => {
            const next = new Set(prev);
            next.delete(key);
            return next;
          });
        }
      }
    },
    [service, settings.filters],
  );

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Load only the selected album; clear selection when switching
  useEffect(() => {
    if (!selectedAlbum) return;
    setSelected(new Set());
    setActiveEntryKey(null);
    const key = selectedAlbum.key;
    if (entriesMap.has(key) || loadingSet.has(key)) return;
    setLoadedKeys((prev) => new Set(prev).add(key));
    fetchAlbumEntries(selectedAlbum);
  }, [selectedAlbum?.key, entriesMap, loadingSet, fetchAlbumEntries]);

  // Only the selected album is visible
  const visibleAlbums = useMemo(
    () =>
      selectedAlbum && loadedKeys.has(selectedAlbum.key) ? [selectedAlbum] : [],
    [selectedAlbum, loadedKeys],
  );

  // Notify parent of visible album (always the selected one when loaded)
  useEffect(() => {
    if (selectedAlbum && loadedKeys.has(selectedAlbum.key)) {
      onVisibleAlbumChange(selectedAlbum);
    }
  }, [selectedAlbum, loadedKeys, onVisibleAlbumChange]);

  // Selection handling
  const allVisibleEntries = useMemo(() => {
    const result: AlbumEntry[] = [];
    for (const a of visibleAlbums) {
      const e = entriesMap.get(a.key);
      if (e) result.push(...e);
    }
    return result;
  }, [visibleAlbums, entriesMap]);

  const entryKey = useCallback(
    (e: AlbumEntry) => `${e.album.key}/${e.name}`,
    [],
  );

  // Propagate selection to parent
  useEffect(() => {
    const selectedEntries = allVisibleEntries.filter((e) =>
      selected.has(entryKey(e)),
    );
    const active = activeEntryKey
      ? allVisibleEntries.find((e) => entryKey(e) === activeEntryKey) ?? null
      : null;
    const activeIdx = active
      ? selectedEntries.findIndex((e) => entryKey(e) === activeEntryKey)
      : -1;
    onSelectionChange(selectedEntries, active, activeIdx);
  }, [selected, activeEntryKey, allVisibleEntries, entryKey, onSelectionChange]);

  const handleSelect = useCallback(
    (entry: AlbumEntry, e: React.MouseEvent) => {
      const key = entryKey(entry);
      setActiveEntryKey(key);
      if (e.metaKey || e.ctrlKey) {
        setSelected((prev) => {
          const next = new Set(prev);
          if (next.has(key)) next.delete(key);
          else next.add(key);
          return next;
        });
      } else if (e.shiftKey && allVisibleEntries.length > 0) {
        const keys = allVisibleEntries.map(entryKey);
        const lastSelected = [...selected].pop();
        const lastIdx = lastSelected ? keys.indexOf(lastSelected) : 0;
        const curIdx = keys.indexOf(key);
        const [start, end] =
          lastIdx <= curIdx ? [lastIdx, curIdx] : [curIdx, lastIdx];
        setSelected(new Set(keys.slice(start, end + 1)));
      } else {
        setSelected(new Set([key]));
      }
    },
    [allVisibleEntries, selected, entryKey],
  );

  const handleDoubleClick = useCallback(
    (entry: AlbumEntry) => {
      appEmitter.emit("edit", { entry });
    },
    [appEmitter],
  );

  // Reset entries when filters change
  const filtersKey = JSON.stringify(settings.filters);
  useEffect(() => {
    setEntriesMap(new Map());
    setLoadingSet(new Set());
    // Re-fetch all loaded albums with new filters
    for (const a of visibleAlbums) {
      fetchAlbumEntries(a);
    }
  }, [filtersKey]);

  if (orderedAlbums.length === 0) {
    return (
      <div className="images-area">
        <p className="placeholder">{t("No albums")}</p>
      </div>
    );
  }

  if (!selectedAlbum) {
    return (
      <div className="images-area">
        <p className="placeholder">{t("Select an album")}</p>
      </div>
    );
  }

  return (
    <div className="images-area" ref={scrollContainerRef}>
      {visibleAlbums.map((album) => (
        <AlbumSection
          key={album.key}
          album={album}
          entries={entriesMap.get(album.key) ?? []}
          loading={loadingSet.has(album.key)}
          selected={selected}
          onSelect={handleSelect}
          onDoubleClick={handleDoubleClick}
          headerRef={(el) => {
            if (el) headerRefsMap.current.set(album.key, el);
            else headerRefsMap.current.delete(album.key);
          }}
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// AlbumList
// ---------------------------------------------------------------------------

interface AlbumListProps {
  orderedAlbums: AlbumWithData[];
  selectedAlbum: Album | null;
  onSelectAlbum: (album: Album) => void;
}

function AlbumList({ orderedAlbums, selectedAlbum, onSelectAlbum }: AlbumListProps) {
  const shortcuts = useShortcuts();
  const contacts = useContacts();
  const mosaicProjects = useProjects(ProjectType.MOSAIC);
  const slideshowProjects = useProjects(ProjectType.SLIDESHOW);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const selectedRef = useRef<HTMLDivElement>(null);

  // Auto-scroll the album list so the selected item stays visible
  useEffect(() => {
    if (selectedRef.current) {
      selectedRef.current.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [selectedAlbum?.key]);

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
    for (const a of orderedAlbums) {
      const year = yearFromAlbumName(a.name);
      if (!groups.has(year)) groups.set(year, []);
      groups.get(year)!.push(a);
    }
    for (const [year, list] of groups) {
      groups.set(year, [...list].sort((a, b) => b.name.localeCompare(a.name)));
    }
    return new Map([...groups.entries()].sort((a, b) => b[0].localeCompare(a[0])));
  }, [orderedAlbums]);

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

  const renderAlbumItem = (album: Album, extra?: string) => {
    const isSelected = selectedAlbum?.key === album.key;
    return (
      <div
        key={album.key}
        ref={isSelected ? selectedRef : undefined}
        role="option"
        aria-selected={isSelected}
        className={`album-item${isSelected ? " selected" : ""}`}
        onClick={() => onSelectAlbum(album)}
        onDrop={(e) => handleDrop(album, e)}
        onDragOver={handleDragOver}
      >
        <span className="album-name">{album.name}</span>
        {extra && <span className="album-extra">{extra}</span>}
      </div>
    );
  };

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
  const albums = useAlbums();
  const [selectedAlbum, setSelectedAlbum] = useState<Album | null>(null);

  // Selection state lifted from PhotoList
  const [selectedEntries, setSelectedEntries] = useState<AlbumEntry[]>([]);
  const [activeEntry, setActiveEntry] = useState<AlbumEntry | null>(null);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [metaPage, setMetaPage] = useState<MetaPage | null>(null);

  const handleSelectionChange = useCallback(
    (entries: AlbumEntry[], active: AlbumEntry | null, idx: number) => {
      setSelectedEntries(entries);
      setActiveEntry(active);
      setActiveIndex(idx);
      if (entries.length === 0) {
        setMetaPage(null);
      }
    },
    [],
  );

  // Flatten albums into display order: group by year prefix, 0000 at end
  const orderedAlbums = useMemo(() => {
    const groups = new Map<string, AlbumWithData[]>();
    for (const a of albums) {
      const year = yearFromAlbumName(a.name);
      if (!groups.has(year)) groups.set(year, []);
      groups.get(year)!.push(a);
    }
    const sorted = [...groups.entries()].sort((a, b) => {
      const [yearA, yearB] = [a[0], b[0]];
      if (yearA === yearB) return 0;
      if (yearA === "0000") return 1;
      if (yearB === "0000") return -1;
      return yearB.localeCompare(yearA);
    });
    return sorted.flatMap(([, yearAlbums]) =>
      [...yearAlbums].sort((a, b) => b.name.localeCompare(a.name)),
    );
  }, [albums]);

  // When the user scrolls into a different album, update the sidebar highlight
  const scrollSelectedRef = useRef(false);
  const handleVisibleAlbumChange = useCallback(
    (album: Album) => {
      setSelectedAlbum((prev) => {
        if (prev?.key === album.key) return prev;
        scrollSelectedRef.current = true;
        return album;
      });
    },
    [],
  );

  const closeMetaPane = useCallback(() => {
    setMetaPage(null);
  }, []);

  return (
    <div className="browser fill">
      <BrowserHeader />
      <div className="browser-navigator fill">
        <AlbumList
          orderedAlbums={orderedAlbums}
          selectedAlbum={selectedAlbum}
          onSelectAlbum={setSelectedAlbum}
        />
        <PhotoList
          orderedAlbums={orderedAlbums}
          selectedAlbum={selectedAlbum}
          onVisibleAlbumChange={handleVisibleAlbumChange}
          onSelectionChange={handleSelectionChange}
        />
      </div>
      <BottomSelectionButtons
        selected={selectedEntries}
        activeEntry={activeEntry}
        activeIndex={activeIndex}
        activeMetaPage={metaPage}
        onMetaPageChange={setMetaPage}
      />
      <MetadataViewer
        entries={selectedEntries}
        page={metaPage}
        onClose={closeMetaPane}
      />
    </div>
  );
}
