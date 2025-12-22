import Database from "better-sqlite3";
import debug from "debug";
import { join } from "path";
import { workerData } from "worker_threads";
import { Album, AlbumEntry, AlbumKind, AlbumWithData } from "../../../shared/types/types";
import { imagesRoot } from "../../utils/constants";

const debugLogger = debug("app:walker-db");

// Database version constant - increment this when schema changes
const DATABASE_VERSION = 1;

/**
 * Shared Walker Database Access
 * 
 * This module provides access to the picisa_walker.db database with enforced single-writer pattern.
 * Only the 'walker' worker can open the database in read-write mode.
 * All other workers and the main thread must use read-only mode.
 */
class WalkerDatabaseAccess {
  private db: Database.Database | null = null;
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
    } else {
      debugLogger("Opening walker database in READ-ONLY mode");
    }
  }

  /**
   * Get the database connection, initializing if necessary
   */
  getDatabase(): Database.Database {
    if (!this.db) {
      if (process.env.DEBUG_SQL) {
        this.db = new Database(this.dbPath, {
          verbose: (sql) => debugLogger(`SQL: ${sql}`),
          readonly: this.readonly
        });
      } else {
        this.db = new Database(this.dbPath, { readonly: this.readonly });
      }

      if (this.isWriter) {
        this.checkAndMigrateDatabase();
      }
    }
    return this.db;
  }

  /**
   * Check database version and migrate if necessary (writer only)
   */
  private checkAndMigrateDatabase(): void {
    if (!this.isWriter || !this.db) return;

    try {
      const versionTableExists = this.db.prepare(`
        SELECT name FROM sqlite_master 
        WHERE type='table' AND name='db_version'
      `).get();

      if (!versionTableExists) {
        debugLogger("First time database setup - creating version table");
        this.db.exec(`
          CREATE TABLE db_version (
            version INTEGER PRIMARY KEY,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
          )
        `);
        this.db.exec(`INSERT INTO db_version (version) VALUES (${DATABASE_VERSION})`);
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
    if (!this.isWriter || !this.db) return;

    debugLogger(`Migrating database from version ${fromVersion} to ${DATABASE_VERSION}`);
    try {
      this.db.exec(`UPDATE db_version SET version = ${DATABASE_VERSION} WHERE version = ${fromVersion}`);
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
    if (!this.isWriter || !this.db) return;

    // Create albums table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS albums (
        key TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        kind TEXT NOT NULL,
        count INTEGER NOT NULL DEFAULT 0,
        shortcut TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create album_entries table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS album_entries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        album_key TEXT NOT NULL,
        entry_name TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (album_key) REFERENCES albums(key) ON DELETE CASCADE,
        UNIQUE(album_key, entry_name)
      )
    `);

    // Create indexes
    this.db.exec(`
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
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }

  /**
   * Check if this instance has write access
   */
  canWrite(): boolean {
    return this.isWriter;
  }

  // ========== QUERY METHODS (Read-only operations) ==========

  /**
   * Get all albums from the database
   */
  getAllAlbums(): AlbumWithData[] {
    const rows = this.getDatabase().prepare(`
      SELECT key, name, kind, count, shortcut FROM albums ORDER BY key
    `).all() as Array<{ key: string; name: string; kind: string; count: number; shortcut: string | null }>;

    return rows.map(row => ({
      key: row.key,
      name: row.name,
      kind: row.kind as AlbumKind,
      count: row.count,
      shortcut: row.shortcut || undefined,
    }));
  }

  /**
   * Get a single album by key
   */
  getAlbum(albumKey: string): AlbumWithData | undefined {
    const row = this.getDatabase().prepare(`
      SELECT key, name, kind, count, shortcut FROM albums WHERE key = ?
    `).get(albumKey) as { key: string; name: string; kind: string; count: number; shortcut: string | null } | undefined;

    if (!row) return undefined;

    return {
      key: row.key,
      name: row.name,
      kind: row.kind as AlbumKind,
      count: row.count,
      shortcut: row.shortcut || undefined,
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

  // ========== WRITE METHODS (Write operations - READWRITE only) ==========

  /**
   * Add or update an album in the database
   */
  upsertAlbum(album: AlbumWithData): void {
    if (!this.isWriter) {
      throw new Error("upsertAlbum can only be called on a READWRITE database instance");
    }

    const stmt = this.getDatabase().prepare(`
      INSERT OR REPLACE INTO albums (key, name, kind, count, shortcut, updated_at)
      VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `);
    stmt.run(
      album.key,
      album.name,
      album.kind,
      album.count,
      album.shortcut || null
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
   * Replace all entries for an album (used during reindex)
   */
  replaceAlbumEntries(album: Album, entries: AlbumEntry[]): void {
    if (!this.isWriter) {
      throw new Error("replaceAlbumEntries can only be called on a READWRITE database instance");
    }

    const transaction = this.getDatabase().transaction(() => {
      // Delete existing entries
      const deleteStmt = this.getDatabase().prepare(`DELETE FROM album_entries WHERE album_key = ?`);
      deleteStmt.run(album.key);

      // Insert new entries
      const insertStmt = this.getDatabase().prepare(`
        INSERT INTO album_entries (album_key, entry_name) VALUES (?, ?)
      `);
      for (const entry of entries) {
        insertStmt.run(album.key, entry.name);
      }
    });

    transaction();
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

