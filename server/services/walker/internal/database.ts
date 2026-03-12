import { Database } from "bun:sqlite";
import debug from "debug";
import { join } from "path";
import { workerData } from "worker_threads";
import { Album, AlbumEntry, AlbumEntryMetaData, AlbumMetaData, AlbumWithData, extraFields, Shortcut } from "../../../../shared/types/types";
import { imagesRoot } from "../../../utils/constants";
import { ensureDbFormatOrRemove, isDev } from "../../../utils/ensure-db-format";

const debugLogger = debug("app:walker-db");

// Database version constant - increment this when schema changes
const DATABASE_VERSION = 3;

/**
 * Shared Walker Database Access
 * 
 * This module provides access to the picisa_walker.db database with enforced single-writer pattern.
 * Only the 'walker' worker can open the database in read-write mode.
 * All other workers and the main thread must use read-only mode.
 */
class WalkerDatabaseAccess {
  private db: Database;
  private dbPath: string;
  private readonly: boolean;
  private isWriter: boolean;

  constructor() {
    this.dbPath = join(imagesRoot, "picisa_walker.db");

    // Only the walker worker can write
    // In main thread, workerData is undefined, so we default to readonly
    const serviceName = workerData?.serviceName;
    this.isWriter = serviceName === 'walker';
    this.readonly = !this.isWriter;

    if (this.isWriter) {
      debugLogger("Opening walker database in READ-WRITE mode (walker worker)");
      if (isDev()) {
        ensureDbFormatOrRemove(this.dbPath, (db) => {
          db.prepare("SELECT version FROM db_version ORDER BY version DESC LIMIT 1").get();
        });
      }
    } else {
      debugLogger("Opening walker database in READ-ONLY mode");
    }

    // Open database (bun:sqlite)
    this.db = new Database(this.dbPath, {
      readonly: this.readonly,
      create: this.isWriter,
    });

    // Wrap prepare and run for SQL logging if DEBUG_SQL is set
    if (process.env.DEBUG_SQL) {
      const originalPrepare = this.db.prepare.bind(this.db);
      const originalRun = this.db.run.bind(this.db);

      this.db.prepare = (sql: string) => {
        debugLogger(`SQL: ${sql}`);
        return originalPrepare(sql);
      };

      this.db.run = (sql: string) => {
        debugLogger(`SQL: ${sql}`);
        return originalRun(sql);
      };
    }

    // Migrate if writer
    if (this.isWriter) {
      this.checkAndMigrateDatabase();
    }
  }

  /**
   * Get the database connection
   */
  getDatabase(): Database {
    return this.db;
  }

  /**
   * Check database version and migrate if necessary (writer only)
   */
  private checkAndMigrateDatabase(): void {
    if (!this.isWriter) return;

    try {
      const versionTableExists = this.db.prepare(`
        SELECT name FROM sqlite_master 
        WHERE type='table' AND name='db_version'
      `).get();

      if (!versionTableExists) {
        debugLogger("First time database setup - creating version table");
        this.db.run(`
          CREATE TABLE db_version (
            version INTEGER PRIMARY KEY,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
          )
        `);
        this.db.run(`INSERT INTO db_version (version) VALUES (${DATABASE_VERSION})`);
        this.initDatabase();
        debugLogger(`Database initialized with version ${DATABASE_VERSION}`);
      } else {
        const currentVersion = this.db.prepare("SELECT version FROM db_version ORDER BY version DESC LIMIT 1").get() as { version: number } | undefined;

        if (!currentVersion || currentVersion.version < DATABASE_VERSION) {
          debugLogger(`Database version mismatch. Current: ${currentVersion?.version || 'unknown'}, Required: ${DATABASE_VERSION}`);
          this.migrateDatabase(currentVersion?.version || 0);
        } else if (currentVersion.version > DATABASE_VERSION) {
          debugLogger(`Database version ${currentVersion.version} is newer than expected ${DATABASE_VERSION}. This may cause compatibility issues.`);
        } else {
          debugLogger(`Database version ${DATABASE_VERSION} is up to date`);
        }
      }
    } catch (error) {
      debugLogger("Error checking database version:", error);
      throw error;
    }
  }

  /**
   * Migrate database to new version (writer only)
   */
  private migrateDatabase(fromVersion: number): void {
    if (!this.isWriter) return;

    debugLogger(`Migrating database from version ${fromVersion} to ${DATABASE_VERSION}`);
    try {
      // Migration from version 1 to 2: Add metadata columns to album_entries
      if (fromVersion < 2) {
        debugLogger("Migrating to version 2: Adding metadata columns to album_entries");
        this.db.run(`
          ALTER TABLE album_entries ADD COLUMN date_taken TEXT;
          ALTER TABLE album_entries ADD COLUMN photostar INTEGER DEFAULT 0;
          ALTER TABLE album_entries ADD COLUMN star INTEGER DEFAULT 0;
          ALTER TABLE album_entries ADD COLUMN star_count TEXT;
          ALTER TABLE album_entries ADD COLUMN caption TEXT;
          ALTER TABLE album_entries ADD COLUMN text TEXT;
          ALTER TABLE album_entries ADD COLUMN textactive TEXT;
          ALTER TABLE album_entries ADD COLUMN dimensions TEXT;
          ALTER TABLE album_entries ADD COLUMN dimensions_from_filter TEXT;
          ALTER TABLE album_entries ADD COLUMN rank TEXT;
          ALTER TABLE album_entries ADD COLUMN rotate TEXT;
          ALTER TABLE album_entries ADD COLUMN faces TEXT;
          ALTER TABLE album_entries ADD COLUMN filters TEXT;
          ALTER TABLE album_entries ADD COLUMN stats TEXT;
          ALTER TABLE album_entries ADD COLUMN persons TEXT;
          ALTER TABLE album_entries ADD COLUMN extra_fields TEXT;
          ALTER TABLE album_entries ADD COLUMN updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP;
        `);
        debugLogger("Migration to version 2 completed");
      }

      // Migration from version 2 to 3: Add lastModified column to albums
      if (fromVersion < 3) {
        debugLogger("Migrating to version 3: Adding lastModified column to albums");
        // Check if column already exists
        const columnExists = this.db.prepare(`
          SELECT COUNT(*) as count FROM pragma_table_info('albums') WHERE name = 'lastModified'
        `).get() as { count: number } | undefined;

        if (!columnExists || columnExists.count === 0) {
          this.db.run(`ALTER TABLE albums ADD COLUMN lastModified TEXT`);
          debugLogger("Added lastModified column to albums table");
        } else {
          debugLogger("Column lastModified already exists, skipping");
        }
        debugLogger("Migration to version 3 completed");
      }

      // Update version to current (version is PRIMARY KEY, so use INSERT OR REPLACE)
      this.db.run(`INSERT OR REPLACE INTO db_version (version) VALUES (${DATABASE_VERSION})`);
      debugLogger(`Database migration completed to version ${DATABASE_VERSION}`);
    } catch (error) {
      debugLogger("Error during database migration:", error);
      throw error;
    }
  }

  /**
   * Initialize database schema (writer only)
   */
  private initDatabase(): void {
    if (!this.isWriter) return;

    // Create albums table
    this.db.run(`
      CREATE TABLE IF NOT EXISTS albums (
        key TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        kind TEXT NOT NULL,
        count INTEGER NOT NULL DEFAULT 0,
        shortcut TEXT,
        lastModified TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create album_entries table with metadata fields
    this.db.run(`
      CREATE TABLE IF NOT EXISTS album_entries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        album_key TEXT NOT NULL,
        entry_name TEXT NOT NULL,
        date_taken TEXT,
        photostar INTEGER DEFAULT 0,
        star INTEGER DEFAULT 0,
        star_count TEXT,
        caption TEXT,
        text TEXT,
        textactive TEXT,
        dimensions TEXT,
        dimensions_from_filter TEXT,
        rank TEXT,
        rotate TEXT,
        faces TEXT,
        filters TEXT,
        stats TEXT,
        persons TEXT,
        extra_fields TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (album_key) REFERENCES albums(key) ON DELETE CASCADE,
        UNIQUE(album_key, entry_name)
      )
    `);

    // Create indexes
    this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_albums_name ON albums(name);
      CREATE INDEX IF NOT EXISTS idx_albums_kind ON albums(kind);
      CREATE INDEX IF NOT EXISTS idx_album_entries_album_key ON album_entries(album_key);
      CREATE INDEX IF NOT EXISTS idx_album_entries_name ON album_entries(entry_name);
    `);
  }

  /**
   * Close the database connection
   */
  close(): void {
    this.db.close();
  }

  /**
   * Check if this instance has write access
   */
  canWrite(): boolean {
    return this.isWriter;
  }

  /**
   * Get the database file path (for attaching to other databases)
   */
  getDatabasePath(): string {
    return this.dbPath;
  }

  // ========== QUERY METHODS (Read-only operations) ==========

  /**
   * Get all albums from the database
   */
  getAllAlbums(): AlbumWithData[] {
    const rows = this.getDatabase().prepare(`
      SELECT key, name, kind, count, shortcut, lastModified FROM albums ORDER BY key
    `).all() as Array<{ key: string; name: string; kind?: string; count: number; shortcut: string | null; lastModified: string | null }>;

    return rows.map(row => ({
      key: row.key,
      name: row.name,
      count: row.count,
      shortcut: row.shortcut || undefined,
      lastModified: row.lastModified || undefined,
    }));
  }

  /**
   * Get a single album by key
   */
  getAlbum(albumKey: string): AlbumWithData | undefined {
    const row = this.getDatabase().prepare(`
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

  /**
   * Get all entries for an album
   */
  getAlbumEntries(album: Album): AlbumEntry[] {
    const rows = this.getDatabase().prepare(`
      SELECT entry_name FROM album_entries WHERE album_key = ? ORDER BY entry_name
    `).all(album.key) as Array<{ entry_name: string }>;

    return rows.map(row => ({
      album,
      name: row.entry_name,
    }));
  }

  /**
   * Get metadata for a specific entry
   */
  getEntryMetadata(entry: AlbumEntry): AlbumEntryMetaData {
    const row = this.getDatabase().prepare(`
      SELECT 
        date_taken, photostar, star, star_count, caption, text, textactive,
        dimensions, dimensions_from_filter, rank, rotate, faces, filters, stats, persons, extra_fields
      FROM album_entries 
      WHERE album_key = ? AND entry_name = ?
    `).get(entry.album.key ?? "", entry.name ?? "") as {
      date_taken: string | null;
      photostar: number | null;
      star: number | null;
      star_count: string | null;
      caption: string | null;
      text: string | null;
      textactive: string | null;
      dimensions: string | null;
      dimensions_from_filter: string | null;
      rank: string | null;
      rotate: string | null;
      faces: string | null;
      filters: string | null;
      stats: string | null;
      persons: string | null;
      extra_fields: string | null;
    } | undefined;

    if (!row) {
      return {};
    }

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

    // Parse extra_fields JSON
    if (row.extra_fields) {
      try {
        const extra = JSON.parse(row.extra_fields) as Partial<Record<extraFields, string>>;
        Object.assign(metadata, extra);
      } catch (e) {
        debugLogger(`Error parsing extra_fields for ${entry.name}:`, e);
      }
    }

    return metadata;
  }

  /**
   * Get all shortcuts (shortcut -> album key mapping)
   */
  getShortcuts(): Shortcut[] {
    const rows = this.getDatabase().prepare(`
      SELECT key, name, kind, shortcut FROM albums WHERE shortcut IS NOT NULL AND shortcut != ''
    `).all() as Array<{ key: string; name: string; kind?: string; shortcut: string }>;

    const result: Shortcut[] = [];
    for (const row of rows) {
      result.push({
        shortcut: row.shortcut,
        album: {
          key: row.key,
          name: row.name,
        },
      });
    }
    return result;
  }

  /**
   * Get shortcut for a specific album
   */
  getAlbumShortcut(albumKey: string): string | undefined {
    const row = this.getDatabase().prepare(`
      SELECT shortcut FROM albums WHERE key = ?
    `).get(albumKey) as { shortcut: string | null } | undefined;

    return row?.shortcut || undefined;
  }

  /**
   * Get all entry metadata for an album (reconstructs AlbumMetaData)
   */
  getAlbumMetaData(album: Album): AlbumMetaData {
    const rows = this.getDatabase().prepare(`
      SELECT 
        entry_name,
        date_taken, photostar, star, star_count, caption, text, textactive,
        dimensions, dimensions_from_filter, rank, rotate, faces, filters, stats, persons, extra_fields
      FROM album_entries 
      WHERE album_key = ?
      ORDER BY entry_name
    `).all(album.key) as Array<{
      entry_name: string;
      date_taken: string | null;
      photostar: number | null;
      star: number | null;
      star_count: string | null;
      caption: string | null;
      text: string | null;
      textactive: string | null;
      dimensions: string | null;
      dimensions_from_filter: string | null;
      rank: string | null;
      rotate: string | null;
      faces: string | null;
      filters: string | null;
      stats: string | null;
      persons: string | null;
      extra_fields: string | null;
    }>;

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

      // Parse extra_fields JSON
      if (row.extra_fields) {
        try {
          const extra = JSON.parse(row.extra_fields) as Partial<Record<extraFields, string>>;
          Object.assign(entryMetadata, extra);
        } catch (e) {
          debugLogger(`Error parsing extra_fields for ${row.entry_name}:`, e);
        }
      }

      metadata[row.entry_name] = entryMetadata;
    }

    return metadata;
  }

  // ========== WRITE METHODS (Write operations - READWRITE only) ==========

  /**
   * Add or update an album in the database
   */
  upsertAlbum(album: AlbumWithData): void {
    if (!this.isWriter) {
      throw new Error("upsertAlbum can only be called on a READWRITE database instance");
    }

    const stmt = this.getDatabase().prepare(`
      INSERT OR REPLACE INTO albums (key, name, kind, count, shortcut, lastModified, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `);
    stmt.run(
      album.key,
      album.name,
      'folder', // Always 'folder' since albums are now only folders (kept for backward compatibility)
      album.count,
      album.shortcut || null,
      album.lastModified || null
    );
  }

  /**
   * Delete an album from the database
   */
  deleteAlbum(albumKey: string): void {
    if (!this.isWriter) {
      throw new Error("deleteAlbum can only be called on a READWRITE database instance");
    }

    const stmt = this.getDatabase().prepare(`DELETE FROM albums WHERE key = ?`);
    stmt.run(albumKey);
  }


  /**
   * Add an entry to the database
   */
  upsertEntry(entry: AlbumEntry): void {
    if (!this.isWriter) {
      throw new Error("upsertEntry can only be called on a READWRITE database instance");
    }

    const stmt = this.getDatabase().prepare(`
      INSERT OR REPLACE INTO album_entries (album_key, entry_name, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
    `);
    stmt.run(entry.album.key, entry.name);
  }

  deleteEntry(entry: AlbumEntry): void {
    if (!this.isWriter) {
      throw new Error("deleteEntry can only be called on a READWRITE database instance");
    }

    const stmt = this.getDatabase().prepare(`DELETE FROM album_entries WHERE album_key = ? AND entry_name = ?`);
    stmt.run(entry.album.key, entry.name);
  }


  /**
   * Update shortcut for an album
   */
  updateAlbumShortcut(albumKey: string, shortcut: string | null): void {
    if (!this.isWriter) {
      throw new Error("updateAlbumShortcut can only be called on a READWRITE database instance");
    }

    // First, remove shortcut from any album that currently has it (to ensure uniqueness)
    if (shortcut) {
      const removeStmt = this.getDatabase().prepare(`
        UPDATE albums SET shortcut = NULL, updated_at = CURRENT_TIMESTAMP WHERE shortcut = ? AND key != ?
      `);
      removeStmt.run(shortcut, albumKey);
    }

    // Now update the album's shortcut
    const stmt = this.getDatabase().prepare(`
      UPDATE albums SET shortcut = ?, updated_at = CURRENT_TIMESTAMP WHERE key = ?
    `);
    stmt.run(shortcut, albumKey);
  }

  /**
   * Update metadata for an entry
   */
  updateEntryMetadata(entry: AlbumEntry, metadata: AlbumEntryMetaData): void {
    if (!this.isWriter) {
      throw new Error("updateEntryMetadata can only be called on a READWRITE database instance");
    }

    const db = this.getDatabase();

    // Extract extra_fields (all keys that are not standard fields)
    const standardFields = new Set([
      'dateTaken', 'photostar', 'star', 'starCount', 'caption', 'text', 'textactive',
      'dimensions', 'dimensionsFromFilter', 'rank', 'rotate', 'faces', 'filters', 'stats', 'persons'
    ]);
    const extra: Partial<Record<extraFields, string>> = {};
    let extraFieldsJson: string | null = null;

    for (const key in metadata) {
      if (!standardFields.has(key)) {
        extra[key as extraFields] = metadata[key as keyof AlbumEntryMetaData] as string;
      }
    }

    if (Object.keys(extra).length > 0) {
      extraFieldsJson = JSON.stringify(extra);
    }

    const stmt = db.prepare(`
      UPDATE album_entries SET
        date_taken = ?,
        photostar = ?,
        star = ?,
        star_count = ?,
        caption = ?,
        text = ?,
        textactive = ?,
        dimensions = ?,
        dimensions_from_filter = ?,
        rank = ?,
        rotate = ?,
        faces = ?,
        filters = ?,
        stats = ?,
        persons = ?,
        extra_fields = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE album_key = ? AND entry_name = ?
    `);

    stmt.run(
      metadata.dateTaken || null,
      metadata.photostar ? 1 : 0,
      metadata.star ? 1 : 0,
      metadata.starCount || null,
      metadata.caption || null,
      metadata.text || null,
      metadata.textactive || null,
      metadata.dimensions || null,
      metadata.dimensionsFromFilter || null,
      metadata.rank || null,
      metadata.rotate || null,
      metadata.faces || null,
      metadata.filters || null,
      metadata.stats || null,
      metadata.persons || null,
      extraFieldsJson,
      entry.album.key ?? '',
      entry.name ?? ''
    );
  }
}

// Singleton instance per process/worker
let dbAccess: WalkerDatabaseAccess | null = null;

/**
 * Get the shared walker database access instance
 * Automatically determines read-only vs read-write based on worker context
 */
export function getWalkerDatabase(): WalkerDatabaseAccess {
  if (!dbAccess) {
    dbAccess = new WalkerDatabaseAccess();
  }
  return dbAccess;
}

/**
 * Close the database connection (for cleanup)
 */
export function closeWalkerDatabase(): void {
  if (dbAccess) {
    dbAccess.close();
    dbAccess = null;
  }
}

