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
  AlbumWithData,
} from "../../../shared/types/types";
import { ProjectType, personKeyFromName } from "../../../shared/types/types";
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
import type { MetaPage } from "../shared/MetadataViewer";

// ---------------------------------------------------------------------------
// Thumbnail
// ---------------------------------------------------------------------------

interface ThumbnailProps {
  entry: AlbumEntry;
  isSelected: boolean;
  onSelect: (e: React.MouseEvent) => void;
  onDoubleClick: () => void;
}

const Thumbnail = React.memo(function Thumbnail({
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
    </div>
  );
});

// ---------------------------------------------------------------------------
// AlbumSection – one album's header + photo grid inside the infinite stream
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
  const entryKey = useCallback(
    (e: AlbumEntry) => `${e.album.key}/${e.name}`,
    [],
  );

  return (
    <div className="album-stream-section">
      <div className="album-stream-header" ref={headerRef} data-album-key={album.key}>
        <h2>{album.name}</h2>
        <span className="entry-count">
          {loading ? "…" : entries.length}
        </span>
      </div>
      {entries.length > 0 && (
        <div className="photo-grid">
          {entries.map((entry) => (
            <Thumbnail
              key={entryKey(entry)}
              entry={entry}
              isSelected={selected.has(entryKey(entry))}
              onSelect={(e) => onSelect(entry, e)}
              onDoubleClick={() => onDoubleClick(entry)}
            />
          ))}
        </div>
      )}
      {loading && entries.length === 0 && (
        <div className="loading-indicator">{t("Loading…")}</div>
      )}
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
  const topSentinelRef = useRef<HTMLDivElement>(null);
  const bottomSentinelRef = useRef<HTMLDivElement>(null);

  // Suppress onVisibleAlbumChange during programmatic scrolls
  const suppressVisibleChangeRef = useRef(false);

  // Build an index for fast lookup
  const albumIndex = useMemo(() => {
    const map = new Map<string, number>();
    orderedAlbums.forEach((a, i) => map.set(a.key, i));
    return map;
  }, [orderedAlbums]);

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
        const list = Array.isArray(result) ? result : result?.entries ?? [];
        setEntriesMap((prev) => new Map(prev).set(key, list));
      } finally {
        setLoadingSet((prev) => {
          const next = new Set(prev);
          next.delete(key);
          return next;
        });
      }
    },
    [service, settings.filters],
  );

  // Ensure an album is loaded (no-op if already loaded)
  const ensureLoaded = useCallback(
    (album: AlbumWithData) => {
      const key = album.key;
      if (entriesMap.has(key) || loadingSet.has(key)) return;
      setLoadedKeys((prev) => new Set(prev).add(key));
      fetchAlbumEntries(album);
    },
    [entriesMap, loadingSet, fetchAlbumEntries],
  );

  // Load an album and its immediate neighbors
  const loadAlbumWindow = useCallback(
    (album: Album) => {
      const idx = albumIndex.get(album.key);
      if (idx === undefined) return;

      const toLoad: AlbumWithData[] = [];
      if (idx > 0) toLoad.push(orderedAlbums[idx - 1]);
      toLoad.push(orderedAlbums[idx]);
      if (idx < orderedAlbums.length - 1) toLoad.push(orderedAlbums[idx + 1]);

      for (const a of toLoad) {
        ensureLoaded(a);
      }
    },
    [albumIndex, orderedAlbums, ensureLoaded],
  );

  // When selectedAlbum changes (user clicked in sidebar), load it and scroll to it
  useEffect(() => {
    if (!selectedAlbum) return;
    loadAlbumWindow(selectedAlbum);
  }, [selectedAlbum?.key, loadAlbumWindow]);

  // Scroll to the selected album header once it's rendered
  useEffect(() => {
    if (!selectedAlbum) return;
    const key = selectedAlbum.key;

    // Wait for the header to be in the DOM
    const raf = requestAnimationFrame(() => {
      const header = headerRefsMap.current.get(key);
      if (header && scrollContainerRef.current) {
        suppressVisibleChangeRef.current = true;
        header.scrollIntoView({ behavior: "smooth", block: "start" });
        // Release suppression after scroll completes
        setTimeout(() => {
          suppressVisibleChangeRef.current = false;
        }, 600);
      }
    });
    return () => cancelAnimationFrame(raf);
  }, [selectedAlbum?.key, entriesMap]);

  // Ordered list of loaded albums (in the correct order)
  const visibleAlbums = useMemo(
    () => orderedAlbums.filter((a) => loadedKeys.has(a.key)),
    [orderedAlbums, loadedKeys],
  );

  // IntersectionObserver for bottom sentinel → load next album
  useEffect(() => {
    const sentinel = bottomSentinelRef.current;
    const container = scrollContainerRef.current;
    if (!sentinel || !container || visibleAlbums.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return;
        const lastLoaded = visibleAlbums[visibleAlbums.length - 1];
        const idx = albumIndex.get(lastLoaded.key);
        if (idx !== undefined && idx < orderedAlbums.length - 1) {
          ensureLoaded(orderedAlbums[idx + 1]);
        }
      },
      { root: container, rootMargin: "400px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [visibleAlbums, albumIndex, orderedAlbums, ensureLoaded]);

  // IntersectionObserver for top sentinel → load previous album
  useEffect(() => {
    const sentinel = topSentinelRef.current;
    const container = scrollContainerRef.current;
    if (!sentinel || !container || visibleAlbums.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return;
        const firstLoaded = visibleAlbums[0];
        const idx = albumIndex.get(firstLoaded.key);
        if (idx !== undefined && idx > 0) {
          const prevAlbum = orderedAlbums[idx - 1];
          // Remember scroll position to avoid jump when prepending
          const prevScrollTop = container.scrollTop;
          const prevScrollHeight = container.scrollHeight;
          ensureLoaded(prevAlbum);
          // After render, restore scroll position
          requestAnimationFrame(() => {
            const newScrollHeight = container.scrollHeight;
            container.scrollTop =
              prevScrollTop + (newScrollHeight - prevScrollHeight);
          });
        }
      },
      { root: container, rootMargin: "200px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [visibleAlbums, albumIndex, orderedAlbums, ensureLoaded]);

  // IntersectionObserver on album headers to track visible album
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container || visibleAlbums.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (suppressVisibleChangeRef.current) return;
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const key = entry.target.getAttribute("data-album-key");
            if (key) {
              const album = orderedAlbums.find((a) => a.key === key);
              if (album) onVisibleAlbumChange(album);
            }
          }
        }
      },
      {
        root: container,
        rootMargin: "-10% 0px -80% 0px",
        threshold: 0,
      },
    );

    for (const [, el] of headerRefsMap.current) {
      observer.observe(el);
    }
    return () => observer.disconnect();
  }, [visibleAlbums, orderedAlbums, onVisibleAlbumChange]);

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
      <div ref={topSentinelRef} className="scroll-sentinel" />
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
      <div ref={bottomSentinelRef} className="scroll-sentinel" />
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
      const ts = a.lastModified ? Number(a.lastModified) : NaN;
      const parsedYear = !isNaN(ts) && ts > 0
        ? new Date(ts).getFullYear()
        : NaN;
      const year = parsedYear > 1970 ? parsedYear.toString() : t("Unknown date");
      if (!groups.has(year)) groups.set(year, []);
      groups.get(year)!.push(a);
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
    },
    [],
  );

  // Flatten albums into display order (same order as AlbumList year groups)
  const orderedAlbums = useMemo(() => {
    const groups = new Map<string, AlbumWithData[]>();
    for (const a of albums) {
      const ts = a.lastModified ? Number(a.lastModified) : NaN;
      const parsedYear = !isNaN(ts) && ts > 0
        ? new Date(ts).getFullYear()
        : NaN;
      const year = parsedYear > 1970 ? parsedYear.toString() : t("Unknown date");
      if (!groups.has(year)) groups.set(year, []);
      groups.get(year)!.push(a);
    }
    const sorted = [...groups.entries()].sort((a, b) =>
      b[0].localeCompare(a[0]),
    );
    return sorted.flatMap(([, yearAlbums]) => yearAlbums);
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
        onMetaPageChange={setMetaPage}
      />
    </div>
  );
}
