import { Database } from "bun:sqlite";
import debug from "debug";
import { join } from "path";
import { existsSync } from "fs";
import { workerData } from "worker_threads";
import {
  Album,
  AlbumEntry,
  AlbumEntryMetaData,
  AlbumMetaData,
  AlbumWithData,
  extraFields,
  Shortcut,
} from "../../../../../shared/types/types";
import { imagesRoot } from "../../../utils/constants";
import { ensureDbFormatOrRemove, isDev } from "../../../utils/ensure-db-format";
import { uuid } from "../../../../../shared/lib/utils";

const debugLogger = debug("app:entries-db");

const DATABASE_VERSION = 1;
const ENTRIES_DB_PATH = join(imagesRoot, "picisa_entries.db");
const WALKER_DB_PATH = join(imagesRoot, "picisa_walker.db");

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
    this.isWriter = serviceName === "walker";

    if (this.isWriter) {
      debugLogger("Opening entries database in READ-WRITE mode (walker worker)");
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
        star_count TEXT, caption TEXT, text TEXT, textactive TEXT,
        dimensions TEXT, dimensions_from_filter TEXT, rank TEXT, rotate TEXT,
        faces TEXT, filters TEXT, stats TEXT, persons TEXT, extra_fields TEXT,
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
          caption, text, textactive, dimensions, dimensions_from_filter, rank, rotate,
          faces, filters, stats, persons, extra_fields, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        entryId, e.album_key, e.entry_name, e.date_taken, e.photostar, e.star, e.star_count,
        e.caption, e.text, e.textactive, e.dimensions, e.dimensions_from_filter, e.rank, e.rotate,
        e.faces, e.filters, e.stats, e.persons, e.extra_fields, e.created_at, e.updated_at
      );
    }

    walkerDb.close();
    entriesDb.close();
    debugLogger("Migration from walker DB completed");
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
        star_count TEXT, caption TEXT, text TEXT, textactive TEXT,
        dimensions TEXT, dimensions_from_filter TEXT, rank TEXT, rotate TEXT,
        faces TEXT, filters TEXT, stats TEXT, persons TEXT, extra_fields TEXT,
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

  getEntryMetadata(entry: AlbumEntry): AlbumEntryMetaData {
    const row = this.db.prepare(`
      SELECT date_taken, photostar, star, star_count, caption, text, textactive,
        dimensions, dimensions_from_filter, rank, rotate, faces, filters, stats, persons, extra_fields
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
    if (row.extra_fields) {
      try {
        Object.assign(metadata, JSON.parse(row.extra_fields));
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

  upsertEntry(entry: AlbumEntry): void {
    if (!this.isWriter) throw new Error("upsertEntry requires READWRITE");
    const existing = this.db.prepare(`
      SELECT entry_id FROM album_entries WHERE album_key = ? AND entry_name = ?
    `).get(entry.album.key, entry.name) as { entry_id: string } | undefined;

    const entryId = existing?.entry_id ?? uuid();
    this.db.prepare(`
      INSERT OR REPLACE INTO album_entries (
        entry_id, album_key, entry_name, updated_at
      ) VALUES (?, ?, ?, CURRENT_TIMESTAMP)
    `).run(entryId, entry.album.key, entry.name);
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

  updateEntryMetadata(entry: AlbumEntry, metadata: AlbumEntryMetaData): void {
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

    this.db.prepare(`
      UPDATE album_entries SET
        date_taken = ?, photostar = ?, star = ?, star_count = ?, caption = ?, text = ?, textactive = ?,
        dimensions = ?, dimensions_from_filter = ?, rank = ?, rotate = ?, faces = ?, filters = ?, stats = ?, persons = ?,
        extra_fields = ?, updated_at = CURRENT_TIMESTAMP
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
