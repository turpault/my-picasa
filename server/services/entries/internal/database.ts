import { Database } from "bun:sqlite";
import debug from "debug";
import { join } from "path";
import { existsSync, unlinkSync } from "fs";
import { isMainThread, workerData } from "worker_threads";
import {
  Album,
  AlbumEntry,
  AlbumEntryMetaData,
  AlbumMetaData,
  AlbumWithData,
  extraFields,
  Shortcut,
  ThumbnailSize,
} from "../../../../shared/types/types";
import { imagesRoot } from "../../../utils/constants";
import { ensureDbFormatOrRemove, isDev } from "../../../utils/ensure-db-format";
import { uuid } from "../../../../shared/lib/utils";

const debugLogger = debug("app:entries-db");

const DATABASE_VERSION = 2;
const ENTRIES_DB_PATH = join(imagesRoot, "picisa_entries.db");
const WALKER_DB_PATH = join(imagesRoot, "picisa_walker.db");
const EXIF_DB_PATH = join(imagesRoot, "picisa_exif.db");
const GEOLOCATE_DB_PATH = join(imagesRoot, "picasa_geolocate.db");
const INDEX_DB_PATH = join(imagesRoot, "picisa_index.db");

/**
 * Unified entries database (picisa_entries.db).
 * Contains albums and album_entries with stable entry_id.
 * Replaces picisa_walker.db for Phase 2+.
 */
class EntriesDatabaseAccess {
  private db: Database;
  private dbPath: string;
  private readonly: boolean;
  private isWriter: boolean;

  constructor() {
    this.dbPath = ENTRIES_DB_PATH;
    const serviceName = workerData?.serviceName;
    // Main thread runs walker, extraction, thumbgen - needs write access
    this.isWriter =
      isMainThread ||
      serviceName === "walker" ||
      serviceName === "extraction" ||
      serviceName === "thumbgen";

    if (this.isWriter) {
      debugLogger("Opening entries database in READ-WRITE mode");
      this.migrateFromWalkerIfNeeded();
      if (isDev()) {
        ensureDbFormatOrRemove(this.dbPath, (db) => {
          db.prepare("SELECT version FROM db_version ORDER BY version DESC LIMIT 1").get();
          db.prepare("SELECT entry_id FROM album_entries LIMIT 1").get();
        });
      }
    } else {
      debugLogger("Opening entries database in READ-ONLY mode");
    }

    this.db = new Database(this.dbPath, {
      readonly: !this.isWriter,
      create: this.isWriter,
    });

    if (this.isWriter) {
      this.db.run("PRAGMA journal_mode=WAL");
    } else {
      this.db.run("PRAGMA busy_timeout=5000");
    }

    if (this.isWriter) {
      this.checkAndMigrateDatabase();
      this.migrateAlbumEntriesIndexVersion();
      this.migrateFilterVersion();
      this.migrateFileStats();
      this.migrateChildTablesIfNeeded();
      this.migratePicturesIndexVersion();
    }
  }

  private migrateFileStats(): void {
    try {
      const info = this.db.prepare("PRAGMA table_info(album_entries)").all() as Array<{ name: string }>;
      if (info.some((c) => c.name === "file_mtime")) return;

      debugLogger("Adding file_mtime and file_size columns to album_entries");
      this.db.run("ALTER TABLE album_entries ADD COLUMN file_mtime TEXT");
      this.db.run("ALTER TABLE album_entries ADD COLUMN file_size INTEGER");
    } catch (e) {
      debugLogger("migrateFileStats error:", e);
    }
  }

  private migrateFilterVersion(): void {
    try {
      const info = this.db.prepare("PRAGMA table_info(album_entries)").all() as Array<{ name: string }>;
      const hasFilterVersion = info.some((c) => c.name === "filter_version");
      if (hasFilterVersion) return;

      debugLogger("Adding filter_version and thumb_filter_version columns to album_entries");
      this.db.run("ALTER TABLE album_entries ADD COLUMN filter_version INTEGER NOT NULL DEFAULT 0");
      this.db.run("ALTER TABLE album_entries ADD COLUMN thumb_filter_version_small INTEGER NOT NULL DEFAULT -1");
      this.db.run("ALTER TABLE album_entries ADD COLUMN thumb_filter_version_medium INTEGER NOT NULL DEFAULT -1");
      this.db.run("ALTER TABLE album_entries ADD COLUMN thumb_filter_version_large INTEGER NOT NULL DEFAULT -1");

      this.db.run("CREATE INDEX IF NOT EXISTS idx_album_entries_filter_version ON album_entries(filter_version)");
      this.db.run(
        "CREATE INDEX IF NOT EXISTS idx_album_entries_thumb_version_small ON album_entries(thumb_filter_version_small, filter_version)"
      );
      this.db.run(
        "CREATE INDEX IF NOT EXISTS idx_album_entries_thumb_version_medium ON album_entries(thumb_filter_version_medium, filter_version)"
      );
    } catch (e) {
      debugLogger("migrateFilterVersion error:", e);
    }
  }

  private migrateAlbumEntriesIndexVersion(): void {
    try {
      const info = this.db.prepare("PRAGMA table_info(album_entries)").all() as Array<{ name: string }>;
      if (info.some((c) => c.name === "index_version")) return;
      debugLogger("Adding index_version to album_entries");
      this.db.run("ALTER TABLE album_entries ADD COLUMN index_version INTEGER NOT NULL DEFAULT 0");
    } catch (e) {
      debugLogger("migrateAlbumEntriesIndexVersion error:", e);
    }
  }

  private migratePicturesIndexVersion(): void {
    const hasPictures = this.db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='pictures'"
    ).get();
    if (!hasPictures) return;
    try {
      const info = this.db.prepare("PRAGMA table_info(pictures)").all() as Array<{ name: string }>;
      if (info.some((c) => c.name === "index_version")) return;
      debugLogger("Adding index_version to pictures");
      this.db.run("ALTER TABLE pictures ADD COLUMN index_version INTEGER NOT NULL DEFAULT 0");
    } catch (e) {
      debugLogger("migratePicturesIndexVersion error:", e);
    }
  }

  private migrateChildTablesIfNeeded(): void {
    const hasExifTable = this.db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='exif_data'"
    ).get();
    if (hasExifTable) return;

    debugLogger("Adding exif_data, geo_poi_data, pictures tables to entries DB");
    this.db.run(`
      CREATE TABLE exif_data (
        entry_id TEXT PRIMARY KEY,
        album_key TEXT NOT NULL, entry_name TEXT NOT NULL,
        exif_data TEXT, has_exif INTEGER DEFAULT 0, processed_at TEXT,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(album_key, entry_name)
      );
      CREATE INDEX idx_exif_album_key ON exif_data(album_key);
      CREATE INDEX idx_exif_entry_name ON exif_data(entry_name);

      CREATE TABLE geo_poi_data (
        entry_id TEXT PRIMARY KEY,
        album_key TEXT NOT NULL, entry_name TEXT NOT NULL,
        geo_poi TEXT, has_geo_poi INTEGER DEFAULT 0, processed_at TEXT,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(album_key, entry_name)
      );
      CREATE INDEX idx_geo_album_key ON geo_poi_data(album_key);
      CREATE INDEX idx_geo_entry_name ON geo_poi_data(entry_name);

      CREATE TABLE pictures (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        entry_id TEXT NOT NULL,
        album_key TEXT NOT NULL, album_name TEXT NOT NULL, entry_name TEXT NOT NULL,
        persons TEXT, star_count TEXT, geo_poi TEXT, photostar INTEGER,
        text_content TEXT, caption TEXT, entry_type TEXT, marked INTEGER DEFAULT 0,
        index_version INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(album_key, entry_name)
      );
      CREATE INDEX idx_pictures_album_key ON pictures(album_key);
      CREATE INDEX idx_pictures_entry_id ON pictures(entry_id);

      CREATE VIRTUAL TABLE pictures_fts USING fts5(
        album_name, entry_name, persons, text_content, caption,
        content='pictures', content_rowid='id'
      );
      CREATE TRIGGER pictures_fts_insert AFTER INSERT ON pictures BEGIN
        INSERT INTO pictures_fts(rowid, album_name, entry_name, persons, text_content, caption)
        VALUES (new.id, new.album_name, new.entry_name, new.persons, new.text_content, new.caption);
      END;
      CREATE TRIGGER pictures_fts_delete AFTER DELETE ON pictures BEGIN
        INSERT INTO pictures_fts(pictures_fts, rowid, album_name, entry_name, persons, text_content, caption)
        VALUES('delete', old.id, old.album_name, old.entry_name, old.persons, old.text_content, old.caption);
      END;
      CREATE TRIGGER pictures_fts_update AFTER UPDATE ON pictures BEGIN
        INSERT INTO pictures_fts(pictures_fts, rowid, album_name, entry_name, persons, text_content, caption)
        VALUES('delete', old.id, old.album_name, old.entry_name, old.persons, old.text_content, old.caption);
        INSERT INTO pictures_fts(rowid, album_name, entry_name, persons, text_content, caption)
        VALUES (new.id, new.album_name, new.entry_name, new.persons, new.text_content, new.caption);
      END;
    `);

    this.migrateDataFromOldDbs();
  }

  private migrateDataFromOldDbs(): void {
    if (existsSync(EXIF_DB_PATH)) {
      try {
        const oldDb = new Database(EXIF_DB_PATH, { readonly: true });
        const rows = oldDb.prepare("SELECT album_key, entry_name, exif_data, has_exif, processed_at FROM exif_data").all() as any[];
        for (const r of rows) {
          const entry = this.db.prepare("SELECT entry_id FROM album_entries WHERE album_key=? AND entry_name=?").get(r.album_key, r.entry_name) as { entry_id: string } | undefined;
          if (entry) {
            this.db.prepare("INSERT OR REPLACE INTO exif_data (entry_id, album_key, entry_name, exif_data, has_exif, processed_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)")
              .run(entry.entry_id, r.album_key, r.entry_name, r.exif_data, r.has_exif ?? 0, r.processed_at);
          }
        }
        oldDb.close();
        debugLogger(`Migrated ${rows.length} exif rows`);
      } catch (e) {
        debugLogger("Exif migration error:", e);
      }
    }
    if (existsSync(GEOLOCATE_DB_PATH)) {
      try {
        const oldDb = new Database(GEOLOCATE_DB_PATH, { readonly: true });
        const rows = oldDb.prepare("SELECT album_key, entry_name, geo_poi, has_geo_poi, processed_at FROM geo_poi_data").all() as any[];
        for (const r of rows) {
          const entry = this.db.prepare("SELECT entry_id FROM album_entries WHERE album_key=? AND entry_name=?").get(r.album_key, r.entry_name) as { entry_id: string } | undefined;
          if (entry) {
            this.db.prepare("INSERT OR REPLACE INTO geo_poi_data (entry_id, album_key, entry_name, geo_poi, has_geo_poi, processed_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)")
              .run(entry.entry_id, r.album_key, r.entry_name, r.geo_poi, r.has_geo_poi ?? 0, r.processed_at);
          }
        }
        oldDb.close();
        debugLogger(`Migrated ${rows.length} geo rows`);
        unlinkSync(GEOLOCATE_DB_PATH);
        debugLogger("Removed old picasa_geolocate.db");
      } catch (e) {
        debugLogger("Geo migration error:", e);
      }
    }
    if (existsSync(INDEX_DB_PATH)) {
      try {
        const oldDb = new Database(INDEX_DB_PATH, { readonly: true });
        const rows = oldDb.prepare("SELECT album_key, album_name, entry_name, persons, star_count, geo_poi, photostar, text_content, caption, entry_type, marked FROM pictures").all() as any[];
        for (const r of rows) {
          const entry = this.db.prepare("SELECT entry_id FROM album_entries WHERE album_key=? AND entry_name=?").get(r.album_key, r.entry_name) as { entry_id: string } | undefined;
          if (entry) {
            const ae = this.db.prepare("SELECT index_version FROM album_entries WHERE album_key=? AND entry_name=?").get(r.album_key, r.entry_name) as { index_version: number } | undefined;
            const indexVersion = ae?.index_version ?? 0;
            this.db.prepare(`
              INSERT OR REPLACE INTO pictures (entry_id, album_key, album_name, entry_name, persons, star_count, geo_poi, photostar, text_content, caption, entry_type, marked, index_version, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            `).run(entry.entry_id, r.album_key, r.album_name, r.entry_name, r.persons, r.star_count, r.geo_poi, r.photostar ?? 0, r.text_content, r.caption, r.entry_type ?? "unknown", r.marked ?? 0, indexVersion);
          }
        }
        oldDb.close();
        debugLogger(`Migrated ${rows.length} picture rows`);
        unlinkSync(INDEX_DB_PATH);
        debugLogger("Removed old picisa_index.db");
      } catch (e) {
        debugLogger("Pictures migration error:", e);
      }
    }
  }

  /**
   * Migrate data from picisa_walker.db if it exists and entries DB is empty
   */
  private migrateFromWalkerIfNeeded(): void {
    if (!existsSync(WALKER_DB_PATH) || existsSync(ENTRIES_DB_PATH)) {
      return;
    }

    debugLogger("Migrating from picisa_walker.db to picisa_entries.db");
    const walkerDb = new Database(WALKER_DB_PATH, { readonly: true });
    const entriesDb = new Database(ENTRIES_DB_PATH, { create: true });

    entriesDb.run(`
      CREATE TABLE db_version (version INTEGER PRIMARY KEY, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
      INSERT INTO db_version (version) VALUES (${DATABASE_VERSION});
      CREATE TABLE albums (
        key TEXT PRIMARY KEY, name TEXT NOT NULL, kind TEXT NOT NULL,
        count INTEGER NOT NULL DEFAULT 0, shortcut TEXT, lastModified TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE album_entries (
        entry_id TEXT PRIMARY KEY,
        album_key TEXT NOT NULL, entry_name TEXT NOT NULL,
        date_taken TEXT, photostar INTEGER DEFAULT 0, star INTEGER DEFAULT 0,
        star_count TEXT, caption TEXT, text TEXT,
        dimensions TEXT, dimensions_from_filter TEXT, rank TEXT, rotate TEXT,
        faces TEXT, filters TEXT, persons TEXT, extra_fields TEXT,
        index_version INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (album_key) REFERENCES albums(key) ON DELETE CASCADE,
        UNIQUE(album_key, entry_name)
      );
      CREATE INDEX idx_albums_name ON albums(name);
      CREATE INDEX idx_albums_kind ON albums(kind);
      CREATE INDEX idx_album_entries_album_key ON album_entries(album_key);
      CREATE INDEX idx_album_entries_name ON album_entries(entry_name);
    `);

    const albums = walkerDb.prepare("SELECT * FROM albums").all() as any[];
    for (const a of albums) {
      entriesDb.prepare(`
        INSERT INTO albums (key, name, kind, count, shortcut, lastModified, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(a.key, a.name, a.kind, a.count ?? 0, a.shortcut, a.lastModified, a.created_at, a.updated_at);
    }

    const entries = walkerDb.prepare("SELECT * FROM album_entries").all() as any[];
    for (const e of entries) {
      const entryId = uuid();
      entriesDb.prepare(`
        INSERT INTO album_entries (
          entry_id, album_key, entry_name, date_taken, photostar, star, star_count,
          caption, text, dimensions, dimensions_from_filter, rank, rotate,
          faces, filters, persons, extra_fields, index_version, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
      `).run(
        entryId, e.album_key, e.entry_name, e.date_taken, e.photostar, e.star, e.star_count,
        e.caption, e.text, e.dimensions, e.dimensions_from_filter, e.rank, e.rotate,
        e.faces, e.filters, e.persons, e.extra_fields, e.created_at, e.updated_at
      );
    }

    walkerDb.close();
    entriesDb.close();
    unlinkSync(WALKER_DB_PATH);
    debugLogger("Migration from walker DB completed, removed picisa_walker.db");
  }

  private checkAndMigrateDatabase(): void {
    if (!this.isWriter) return;

    try {
      const versionTableExists = this.db.prepare(`
        SELECT name FROM sqlite_master WHERE type='table' AND name='db_version'
      `).get();

      if (!versionTableExists) {
        debugLogger("First time entries database setup");
        this.db.run(`
          CREATE TABLE db_version (version INTEGER PRIMARY KEY, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)
        `);
        this.db.run(`INSERT INTO db_version (version) VALUES (${DATABASE_VERSION})`);
        this.initDatabase();
      }
    } catch (error) {
      debugLogger("Error checking database version:", error);
      throw error;
    }
  }

  private initDatabase(): void {
    this.db.run(`
      CREATE TABLE IF NOT EXISTS albums (
        key TEXT PRIMARY KEY, name TEXT NOT NULL, kind TEXT NOT NULL,
        count INTEGER NOT NULL DEFAULT 0, shortcut TEXT, lastModified TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    this.db.run(`
      CREATE TABLE IF NOT EXISTS album_entries (
        entry_id TEXT PRIMARY KEY,
        album_key TEXT NOT NULL, entry_name TEXT NOT NULL,
        date_taken TEXT, photostar INTEGER DEFAULT 0, star INTEGER DEFAULT 0,
        star_count TEXT, caption TEXT, text TEXT,
        dimensions TEXT, dimensions_from_filter TEXT, rank TEXT, rotate TEXT,
        faces TEXT, filters TEXT, persons TEXT, extra_fields TEXT,
        index_version INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (album_key) REFERENCES albums(key) ON DELETE CASCADE,
        UNIQUE(album_key, entry_name)
      )
    `);
    this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_albums_name ON albums(name);
      CREATE INDEX IF NOT EXISTS idx_albums_kind ON albums(kind);
      CREATE INDEX IF NOT EXISTS idx_album_entries_album_key ON album_entries(album_key);
      CREATE INDEX IF NOT EXISTS idx_album_entries_name ON album_entries(entry_name);
    `);
  }

  getDatabase(): Database {
    return this.db;
  }

  getDatabasePath(): string {
    return this.dbPath;
  }

  close(): void {
    this.db.close();
  }

  canWrite(): boolean {
    return this.isWriter;
  }

  // ========== Query methods (mirror walker API) ==========

  getAllAlbums(): AlbumWithData[] {
    const rows = this.db.prepare(`
      SELECT key, name, kind, count, shortcut, lastModified FROM albums ORDER BY key
    `).all() as Array<{ key: string; name: string; kind?: string; count: number; shortcut: string | null; lastModified: string | null }>;
    return rows.map((r) => ({
      key: r.key,
      name: r.name,
      count: r.count,
      shortcut: r.shortcut || undefined,
      lastModified: r.lastModified || undefined,
    }));
  }

  getAlbum(albumKey: string): AlbumWithData | undefined {
    const row = this.db.prepare(`
      SELECT key, name, kind, count, shortcut, lastModified FROM albums WHERE key = ?
    `).get(albumKey) as { key: string; name: string; kind?: string; count: number; shortcut: string | null; lastModified: string | null } | undefined;
    if (!row) return undefined;
    return {
      key: row.key,
      name: row.name,
      count: row.count,
      shortcut: row.shortcut || undefined,
      lastModified: row.lastModified || undefined,
    };
  }

  getAlbumEntries(album: Album): AlbumEntry[] {
    const rows = this.db.prepare(`
      SELECT entry_name FROM album_entries WHERE album_key = ? ORDER BY entry_name
    `).all(album.key) as Array<{ entry_name: string }>;
    return rows.map((r) => ({ album, name: r.entry_name }));
  }

  getEntriesNeedingThumbnails(
    sizes: ThumbnailSize[],
  ): Array<{ album: Album; entry_name: string; size: ThumbnailSize }> {
    const hasColumns = this.db
      .prepare("PRAGMA table_info(album_entries)")
      .all() as Array<{ name: string }>;
    if (!hasColumns.some((c) => c.name === "filter_version")) {
      return [];
    }

    const sizeToColumn: Record<ThumbnailSize, string> = {
      "th-small": "thumb_filter_version_small",
      "th-medium": "thumb_filter_version_medium",
      "th-large": "thumb_filter_version_large",
    };

    const results: Array<{ album: Album; entry_name: string; size: ThumbnailSize }> = [];
    const albums = this.getAllAlbums();

    for (const size of sizes) {
      const col = sizeToColumn[size];
      const rows = this.db
        .prepare(
          `SELECT ae.album_key, a.name AS album_name, ae.entry_name
           FROM album_entries ae
           JOIN albums a ON ae.album_key = a.key
           WHERE ae.${col} < ae.filter_version OR ae.${col} = -1`,
        )
        .all() as Array<{ album_key: string; album_name: string; entry_name: string }>;

      for (const r of rows) {
        const album = albums.find((a) => a.key === r.album_key) ?? {
          key: r.album_key,
          name: r.album_name,
          count: 0,
        };
        results.push({ album, entry_name: r.entry_name, size });
      }
    }
    return results;
  }

  getEntryMetadata(entry: AlbumEntry): AlbumEntryMetaData {
    const row = this.db.prepare(`
      SELECT date_taken, photostar, star, star_count, caption, text, textactive,
        dimensions, dimensions_from_filter, rank, rotate, faces, filters, stats, persons, extra_fields,
        filter_version, thumb_filter_version_small, thumb_filter_version_medium, thumb_filter_version_large
      FROM album_entries WHERE album_key = ? AND entry_name = ?
    `).get(entry.album.key ?? "", entry.name ?? "") as any;
    if (!row) return {};

    const metadata: AlbumEntryMetaData = {};
    if (row.date_taken) metadata.dateTaken = row.date_taken;
    if (row.photostar !== null) metadata.photostar = row.photostar === 1;
    if (row.star !== null) metadata.star = row.star === 1;
    if (row.star_count) metadata.starCount = row.star_count;
    if (row.caption) metadata.caption = row.caption;
    if (row.text) metadata.text = row.text;
    if (row.textactive) metadata.textactive = row.textactive;
    if (row.dimensions) metadata.dimensions = row.dimensions;
    if (row.dimensions_from_filter) metadata.dimensionsFromFilter = row.dimensions_from_filter;
    if (row.rank) metadata.rank = row.rank;
    if (row.rotate) metadata.rotate = row.rotate;
    if (row.faces) metadata.faces = row.faces;
    if (row.filters) metadata.filters = row.filters;
    if (row.stats) metadata.stats = row.stats;
    if (row.persons) metadata.persons = row.persons;
    if (row.filter_version !== undefined) metadata.filterVersion = row.filter_version;
    if (row.thumb_filter_version_small !== undefined) metadata.thumbFilterVersionSmall = row.thumb_filter_version_small;
    if (row.thumb_filter_version_medium !== undefined) metadata.thumbFilterVersionMedium = row.thumb_filter_version_medium;
    if (row.thumb_filter_version_large !== undefined) metadata.thumbFilterVersionLarge = row.thumb_filter_version_large;
    if (row.extra_fields) {
      try {
        const extra = JSON.parse(row.extra_fields);
        for (const k of Object.keys(extra)) {
          if (!k.startsWith("cached:") && !k.startsWith("thumb_filter_version:")) {
            (metadata as Record<string, unknown>)[k] = extra[k];
          }
        }
      } catch (e) {
        debugLogger(`Error parsing extra_fields for ${entry.name}:`, e);
      }
    }
    return metadata;
  }

  getShortcuts(): Shortcut[] {
    const rows = this.db.prepare(`
      SELECT key, name, kind, shortcut FROM albums WHERE shortcut IS NOT NULL AND shortcut != ''
    `).all() as Array<{ key: string; name: string; kind?: string; shortcut: string }>;
    return rows.map((r) => ({
      shortcut: r.shortcut,
      album: { key: r.key, name: r.name },
    }));
  }

  getAlbumShortcut(albumKey: string): string | undefined {
    const row = this.db.prepare(`SELECT shortcut FROM albums WHERE key = ?`).get(albumKey) as { shortcut: string | null } | undefined;
    return row?.shortcut || undefined;
  }

  getAlbumMetaData(album: Album): AlbumMetaData {
    const rows = this.db.prepare(`
      SELECT entry_name, date_taken, photostar, star, star_count, caption, text, textactive,
        dimensions, dimensions_from_filter, rank, rotate, faces, filters, stats, persons, extra_fields
      FROM album_entries WHERE album_key = ? ORDER BY entry_name
    `).all(album.key) as any[];
    const metadata: AlbumMetaData = {};
    for (const row of rows) {
      const entryMetadata: AlbumEntryMetaData = {};
      if (row.date_taken) entryMetadata.dateTaken = row.date_taken;
      if (row.photostar !== null) entryMetadata.photostar = row.photostar === 1;
      if (row.star !== null) entryMetadata.star = row.star === 1;
      if (row.star_count) entryMetadata.starCount = row.star_count;
      if (row.caption) entryMetadata.caption = row.caption;
      if (row.text) entryMetadata.text = row.text;
      if (row.textactive) entryMetadata.textactive = row.textactive;
      if (row.dimensions) entryMetadata.dimensions = row.dimensions;
      if (row.dimensions_from_filter) entryMetadata.dimensionsFromFilter = row.dimensions_from_filter;
      if (row.rank) entryMetadata.rank = row.rank;
      if (row.rotate) entryMetadata.rotate = row.rotate;
      if (row.faces) entryMetadata.faces = row.faces;
      if (row.filters) entryMetadata.filters = row.filters;
      if (row.stats) entryMetadata.stats = row.stats;
      if (row.persons) entryMetadata.persons = row.persons;
      if (row.extra_fields) {
        try {
          Object.assign(entryMetadata, JSON.parse(row.extra_fields));
        } catch (e) {
          debugLogger(`Error parsing extra_fields for ${row.entry_name}:`, e);
        }
      }
      metadata[row.entry_name] = entryMetadata;
    }
    return metadata;
  }

  // ========== Write methods ==========

  upsertAlbum(album: AlbumWithData): void {
    if (!this.isWriter) throw new Error("upsertAlbum requires READWRITE");
    this.db.prepare(`
      INSERT OR REPLACE INTO albums (key, name, kind, count, shortcut, lastModified, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `).run(album.key, album.name, "folder", album.count, album.shortcut || null, album.lastModified || null);
  }

  deleteAlbum(albumKey: string): void {
    if (!this.isWriter) throw new Error("deleteAlbum requires READWRITE");
    this.db.prepare(`DELETE FROM albums WHERE key = ?`).run(albumKey);
  }

  upsertEntry(entry: AlbumEntry, fileStats?: { mtime: string; size: number }): void {
    if (!this.isWriter) throw new Error("upsertEntry requires READWRITE");
    const existing = this.db.prepare(`
      SELECT entry_id FROM album_entries WHERE album_key = ? AND entry_name = ?
    `).get(entry.album.key, entry.name) as { entry_id: string } | undefined;

    const entryId = existing?.entry_id ?? uuid();
    const hasFileStats = this.db.prepare("PRAGMA table_info(album_entries)").all() as Array<{ name: string }>;
    if (hasFileStats.some((c) => c.name === "file_mtime") && fileStats) {
      this.db.prepare(`
        INSERT INTO album_entries (entry_id, album_key, entry_name, file_mtime, file_size, updated_at)
        VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(album_key, entry_name) DO UPDATE SET
          file_mtime = excluded.file_mtime,
          file_size = excluded.file_size,
          updated_at = CURRENT_TIMESTAMP
      `).run(entryId, entry.album.key, entry.name, fileStats.mtime, fileStats.size);
    } else {
      this.db.prepare(`
        INSERT OR REPLACE INTO album_entries (
          entry_id, album_key, entry_name, updated_at
        ) VALUES (?, ?, ?, CURRENT_TIMESTAMP)
      `).run(entryId, entry.album.key, entry.name);
    }
  }

  getEntryFileStats(entry: AlbumEntry): { mtime: string; size: number } | null {
    const hasFileStats = this.db.prepare("PRAGMA table_info(album_entries)").all() as Array<{ name: string }>;
    if (!hasFileStats.some((c) => c.name === "file_mtime")) return null;

    const row = this.db.prepare(`
      SELECT file_mtime, file_size FROM album_entries WHERE album_key = ? AND entry_name = ?
    `).get(entry.album.key ?? "", entry.name) as { file_mtime: string | null; file_size: number | null } | undefined;
    if (!row || row.file_mtime == null || row.file_size == null) return null;
    return { mtime: row.file_mtime, size: row.file_size };
  }

  updateEntryFileStats(entry: AlbumEntry, mtime: string, size: number): void {
    if (!this.isWriter) throw new Error("updateEntryFileStats requires READWRITE");
    const hasFileStats = this.db.prepare("PRAGMA table_info(album_entries)").all() as Array<{ name: string }>;
    if (!hasFileStats.some((c) => c.name === "file_mtime")) return;

    this.db.prepare(`
      UPDATE album_entries SET file_mtime = ?, file_size = ?, updated_at = CURRENT_TIMESTAMP
      WHERE album_key = ? AND entry_name = ?
    `).run(mtime, size, entry.album.key ?? "", entry.name);
  }

  updateEntryLocation(entryId: string, albumKey: string, entryName: string): void {
    if (!this.isWriter) throw new Error("updateEntryLocation requires READWRITE");
    this.db.prepare(`
      UPDATE album_entries SET album_key = ?, entry_name = ?, updated_at = CURRENT_TIMESTAMP
      WHERE entry_id = ?
    `).run(albumKey, entryName, entryId);
  }

  deleteEntry(entry: AlbumEntry): void {
    if (!this.isWriter) throw new Error("deleteEntry requires READWRITE");
    this.db.prepare(`DELETE FROM album_entries WHERE album_key = ? AND entry_name = ?`).run(entry.album.key, entry.name);
  }

  updateAlbumShortcut(albumKey: string, shortcut: string | null): void {
    if (!this.isWriter) throw new Error("updateAlbumShortcut requires READWRITE");
    if (shortcut) {
      this.db.prepare(`UPDATE albums SET shortcut = NULL, updated_at = CURRENT_TIMESTAMP WHERE shortcut = ? AND key != ?`).run(shortcut, albumKey);
    }
    this.db.prepare(`UPDATE albums SET shortcut = ?, updated_at = CURRENT_TIMESTAMP WHERE key = ?`).run(shortcut, albumKey);
  }

  updateThumbFilterVersion(
    entry: AlbumEntry,
    size: ThumbnailSize,
    filterVersion: number,
  ): void {
    if (!this.isWriter) throw new Error("updateThumbFilterVersion requires READWRITE");
    const column =
      size === "th-small"
        ? "thumb_filter_version_small"
        : size === "th-medium"
          ? "thumb_filter_version_medium"
          : "thumb_filter_version_large";
    this.db
      .prepare(
        `UPDATE album_entries SET ${column} = ?, updated_at = CURRENT_TIMESTAMP WHERE album_key = ? AND entry_name = ?`,
      )
      .run(filterVersion, entry.album.key ?? "", entry.name ?? "");
  }

  updateEntryMetadata(
    entry: AlbumEntry,
    metadata: AlbumEntryMetaData,
    options?: { incrementFilterVersion?: boolean },
  ): void {
    if (!this.isWriter) throw new Error("updateEntryMetadata requires READWRITE");
    const standardFields = new Set([
      "dateTaken", "photostar", "star", "starCount", "caption", "text", "textactive",
      "dimensions", "dimensionsFromFilter", "rank", "rotate", "faces", "filters", "stats", "persons",
    ]);
    const extra: Partial<Record<extraFields, string>> = {};
    for (const key in metadata) {
      if (!standardFields.has(key)) {
        extra[key as extraFields] = metadata[key as keyof AlbumEntryMetaData] as string;
      }
    }
    const extraFieldsJson = Object.keys(extra).length > 0 ? JSON.stringify(extra) : null;

    const filterVersionIncrement = options?.incrementFilterVersion
      ? ", filter_version = filter_version + 1"
      : "";

    this.db.prepare(`
      UPDATE album_entries SET
        date_taken = ?, photostar = ?, star = ?, star_count = ?, caption = ?, text = ?, textactive = ?,
        dimensions = ?, dimensions_from_filter = ?, rank = ?, rotate = ?, faces = ?, filters = ?, stats = ?, persons = ?,
        extra_fields = ?, index_version = index_version + 1${filterVersionIncrement}, updated_at = CURRENT_TIMESTAMP
      WHERE album_key = ? AND entry_name = ?
    `).run(
      metadata.dateTaken || null, metadata.photostar ? 1 : 0, metadata.star ? 1 : 0,
      metadata.starCount || null, metadata.caption || null, metadata.text || null, metadata.textactive || null,
      metadata.dimensions || null, metadata.dimensionsFromFilter || null, metadata.rank || null,
      metadata.rotate || null, metadata.faces || null, metadata.filters || null, metadata.stats || null,
      metadata.persons || null, extraFieldsJson, entry.album.key ?? "", entry.name ?? ""
    );
  }
}

let dbAccess: EntriesDatabaseAccess | null = null;

export function getEntriesDatabase(): EntriesDatabaseAccess {
  if (!dbAccess) {
    dbAccess = new EntriesDatabaseAccess();
  }
  return dbAccess;
}

export function closeEntriesDatabase(): void {
  if (dbAccess) {
    dbAccess.close();
    dbAccess = null;
  }
}

/** Backward compatibility: returns entries DB for attach (has albums, album_entries) */
export function getWalkerDatabase(): EntriesDatabaseAccess {
  return getEntriesDatabase();
}

export function closeWalkerDatabase(): void {
  closeEntriesDatabase();
}
