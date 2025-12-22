import Database from "better-sqlite3";
import debug from "debug";
import { join } from "path";
import { AlbumEntry } from "../../../shared/types/types";
import { imagesRoot } from "../../utils/constants";

const debugLogger = debug("app:exif-db");

// Database version constant - increment this when schema changes
const DATABASE_VERSION = 1;

export type OpenMode = 'READ' | 'READWRITE';

/**
 * Shared EXIF Database Access
 * 
 * This module provides access to the picisa_exif.db database with enforced single-writer pattern.
 * Only instances opened with READWRITE mode can write to the database.
 * All other instances must use READ mode.
 */
export class ExifDatabaseAccess {
  private db: Database.Database | null = null;
  private dbPath: string;
  private readonly: boolean;
  private isWriter: boolean;
  private openMode: OpenMode;

  constructor(openMode: OpenMode = 'READ') {
    this.dbPath = join(imagesRoot, "picisa_exif.db");
    this.openMode = openMode;
    this.isWriter = openMode === 'READWRITE';
    this.readonly = !this.isWriter;

    if (this.isWriter) {
      debugLogger("Opening EXIF database in READ-WRITE mode");
    } else {
      debugLogger("Opening EXIF database in READ-ONLY mode");
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
      // For version 1, no migration needed yet
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

    // Create exif_data table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS exif_data (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        album_key TEXT NOT NULL,
        album_name TEXT NOT NULL,
        entry_name TEXT NOT NULL,
        exif_data TEXT,
        has_exif BOOLEAN NOT NULL DEFAULT 0,
        processed_at TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create indexes for better query performance
    this.db.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_exif_entry ON exif_data(album_key, entry_name);
      CREATE INDEX IF NOT EXISTS idx_album_key ON exif_data(album_key);
      CREATE INDEX IF NOT EXISTS idx_album_name ON exif_data(album_name);
      CREATE INDEX IF NOT EXISTS idx_entry_name ON exif_data(entry_name);
      CREATE INDEX IF NOT EXISTS idx_has_exif ON exif_data(has_exif);
      CREATE INDEX IF NOT EXISTS idx_processed_at ON exif_data(processed_at);
    `);

    debugLogger("Database initialized at:", this.dbPath);
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
   * Get EXIF data for a specific entry
   */
  getExifData(entry: AlbumEntry): string | null {
    const result = this.getDatabase()
      .prepare(
        `SELECT exif_data FROM exif_data WHERE album_key = ? AND entry_name = ?`
      )
      .get(entry.album.key ?? "", entry.name ?? "") as { exif_data: string | null } | undefined;
    
    return result?.exif_data ?? null;
  }

  /**
   * Check if an entry has EXIF data
   */
  hasExifData(entry: AlbumEntry): boolean {
    const result = this.getDatabase()
      .prepare(
        `SELECT has_exif FROM exif_data WHERE album_key = ? AND entry_name = ?`
      )
      .get(entry.album.key ?? "", entry.name ?? "") as { has_exif: number } | undefined;
    
    return (result?.has_exif ?? 0) === 1;
  }

  /**
   * Get all entries that need EXIF processing (no EXIF data yet)
   */
  getUnprocessedEntries(): Array<{ album_key: string; album_name: string; entry_name: string }> {
    const results = this.getDatabase()
      .prepare(
        `SELECT album_key, album_name, entry_name 
         FROM exif_data 
         WHERE has_exif = 0 OR exif_data IS NULL
         ORDER BY created_at ASC`
      )
      .all() as Array<{ album_key: string; album_name: string; entry_name: string }>;
    
    return results;
  }

  /**
   * Get statistics about the EXIF database
   */
  getStats(): { totalEntries: number; processedEntries: number; unprocessedEntries: number; lastProcessed: string } {
    const db = this.getDatabase();
    const totalEntries = db.prepare("SELECT COUNT(*) as count FROM exif_data").get() as { count: number };
    const processedEntries = db.prepare("SELECT COUNT(*) as count FROM exif_data WHERE has_exif = 1").get() as { count: number };
    const unprocessedEntries = db.prepare("SELECT COUNT(*) as count FROM exif_data WHERE has_exif = 0 OR exif_data IS NULL").get() as { count: number };
    const lastProcessed = db.prepare("SELECT MAX(processed_at) as last_processed FROM exif_data WHERE processed_at IS NOT NULL").get() as { last_processed: string | null };

    return {
      totalEntries: totalEntries.count,
      processedEntries: processedEntries.count,
      unprocessedEntries: unprocessedEntries.count,
      lastProcessed: lastProcessed.last_processed || 'Never'
    };
  }

  // ========== WRITE METHODS (Write operations - READWRITE only) ==========

  /**
   * Create or update an entry in the database (without EXIF data initially)
   */
  upsertEntry(entry: AlbumEntry): void {
    if (!this.isWriter) {
      throw new Error("upsertEntry can only be called on a READWRITE database instance");
    }

    const db = this.getDatabase();
    try {
      if (entry.album.key === undefined || entry.album.name === undefined || entry.name === undefined) {
        debugLogger(`Error upserting entry ${entry.name}: album.key or album.name or name is undefined`);
        return;
      }

      const upsertStmt = db.prepare(`
        INSERT INTO exif_data (
          album_key, album_name, entry_name, exif_data, has_exif, updated_at
        ) VALUES (?, ?, ?, NULL, 0, CURRENT_TIMESTAMP)
        ON CONFLICT(album_key, entry_name) DO UPDATE SET
          album_name = excluded.album_name,
          updated_at = CURRENT_TIMESTAMP
      `);

      upsertStmt.run(
        entry.album.key ?? '',
        entry.album.name ?? '',
        entry.name ?? ''
      );

    } catch (error: any) {
      debugLogger(`Error upserting entry ${entry.name}:`, error);
      throw error;
    }
  }

  /**
   * Update EXIF data for an entry
   */
  updateExifData(entry: AlbumEntry, exifData: string | null): void {
    if (!this.isWriter) {
      throw new Error("updateExifData can only be called on a READWRITE database instance");
    }

    const db = this.getDatabase();
    try {
      if (entry.album.key === undefined || entry.name === undefined) {
        debugLogger(`Error updating EXIF data for ${entry.name}: album.key or name is undefined`);
        return;
      }

      const hasExif = exifData !== null && exifData.trim().length > 0;

      const updateStmt = db.prepare(`
        UPDATE exif_data SET
          exif_data = ?,
          has_exif = ?,
          processed_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
        WHERE album_key = ? AND entry_name = ?
      `);

      const result = updateStmt.run(
        exifData,
        hasExif ? 1 : 0,
        entry.album.key ?? '',
        entry.name ?? ''
      );

      if (result.changes === 0) {
        // Entry doesn't exist, create it
        const insertStmt = db.prepare(`
          INSERT INTO exif_data (
            album_key, album_name, entry_name, exif_data, has_exif, processed_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        `);
        insertStmt.run(
          entry.album.key ?? '',
          entry.album.name ?? '',
          entry.name ?? '',
          exifData,
          hasExif ? 1 : 0
        );
      }

      debugLogger(`Updated EXIF data for entry ${entry.name}`);
    } catch (error) {
      debugLogger(`Error updating EXIF data for entry ${entry.name}:`, error);
      throw error;
    }
  }

  /**
   * Remove an entry from the database
   */
  removeEntry(entry: AlbumEntry): void {
    if (!this.isWriter) {
      throw new Error("removeEntry can only be called on a READWRITE database instance");
    }

    const db = this.getDatabase();
    const removeStmt = db.prepare(`
      DELETE FROM exif_data WHERE album_key = ? AND entry_name = ?
    `);
    removeStmt.run(entry.album.key || '', entry.name || '');
    debugLogger(`Removed entry ${entry.name} from EXIF database`);
  }
}

// Singleton instances per process/worker
let readOnlyDbAccess: ExifDatabaseAccess | null = null;
let readWriteDbAccess: ExifDatabaseAccess | null = null;

/**
 * Get a read-only EXIF database access instance
 */
export function getExifDatabaseReadOnly(): ExifDatabaseAccess {
  if (!readOnlyDbAccess) {
    readOnlyDbAccess = new ExifDatabaseAccess('READ');
  }
  return readOnlyDbAccess;
}

/**
 * Get a read-write EXIF database access instance
 * Only the EXIF worker should use this
 */
export function getExifDatabaseReadWrite(): ExifDatabaseAccess {
  if (!readWriteDbAccess) {
    readWriteDbAccess = new ExifDatabaseAccess('READWRITE');
  }
  return readWriteDbAccess;
}

/**
 * Close the database connections (for cleanup)
 */
export function closeExifDatabase(): void {
  if (readOnlyDbAccess) {
    readOnlyDbAccess.close();
    readOnlyDbAccess = null;
  }
  if (readWriteDbAccess) {
    readWriteDbAccess.close();
    readWriteDbAccess = null;
  }
}

