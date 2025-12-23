import Database from "better-sqlite3";
import debug from "debug";
import { join } from "path";
import { AlbumEntry } from "../../../shared/types/types";
import { imagesRoot } from "../../utils/constants";
import { getExifData } from "../../rpc/rpcFunctions/exif";

const debugLogger = debug("app:geolocate-db");

// Database version constant - increment this when schema changes
const DATABASE_VERSION = 1;

export type OpenMode = 'READ' | 'READWRITE';

/**
 * Shared Geolocate Database Access
 * 
 * This module provides access to the picasa_geolocate.db database with enforced single-writer pattern.
 * Only instances opened with READWRITE mode can write to the database.
 * All other instances must use READ mode.
 */
export class GeolocateDatabaseAccess {
  private db: Database.Database | null = null;
  private dbPath: string;
  private readonly: boolean;
  private isWriter: boolean;
  private openMode: OpenMode;

  constructor(openMode: OpenMode = 'READ') {
    this.dbPath = join(imagesRoot, "picasa_geolocate.db");
    this.openMode = openMode;
    this.isWriter = openMode === 'READWRITE';
    this.readonly = !this.isWriter;

    if (this.isWriter) {
      debugLogger("Opening Geolocate database in READ-WRITE mode");
    } else {
      debugLogger("Opening Geolocate database in READ-ONLY mode");
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

    // Create geo_poi_data table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS geo_poi_data (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        album_key TEXT NOT NULL,
        album_name TEXT NOT NULL,
        entry_name TEXT NOT NULL,
        geo_poi TEXT,
        has_geo_poi BOOLEAN NOT NULL DEFAULT 0,
        processed_at TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create indexes for better query performance
    this.db.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_geo_entry ON geo_poi_data(album_key, entry_name);
      CREATE INDEX IF NOT EXISTS idx_album_key ON geo_poi_data(album_key);
      CREATE INDEX IF NOT EXISTS idx_album_name ON geo_poi_data(album_name);
      CREATE INDEX IF NOT EXISTS idx_entry_name ON geo_poi_data(entry_name);
      CREATE INDEX IF NOT EXISTS idx_has_geo_poi ON geo_poi_data(has_geo_poi);
      CREATE INDEX IF NOT EXISTS idx_processed_at ON geo_poi_data(processed_at);
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
   * Get geo POI data for a specific entry
   */
  getGeoPOI(entry: AlbumEntry): string | null {
    const result = this.getDatabase()
      .prepare(
        `SELECT geo_poi FROM geo_poi_data WHERE album_key = ? AND entry_name = ?`
      )
      .get(entry.album.key ?? "", entry.name ?? "") as { geo_poi: string | null } | undefined;

    return result?.geo_poi ?? null;
  }

  /**
   * Check if an entry has geo POI data
   */
  hasGeoPOI(entry: AlbumEntry): boolean {
    const result = this.getDatabase()
      .prepare(
        `SELECT has_geo_poi FROM geo_poi_data WHERE album_key = ? AND entry_name = ?`
      )
      .get(entry.album.key ?? "", entry.name ?? "") as { has_geo_poi: number } | undefined;

    return (result?.has_geo_poi ?? 0) === 1;
  }

  /**
   * Check if an entry has been processed (regardless of whether it has geo POI data)
   */
  isProcessed(entry: AlbumEntry): boolean {
    const result = this.getDatabase()
      .prepare(
        `SELECT processed_at FROM geo_poi_data WHERE album_key = ? AND entry_name = ?`
      )
      .get(entry.album.key ?? "", entry.name ?? "") as { processed_at: string | null } | undefined;

    return result !== undefined && result.processed_at !== null;
  }

  /**
   * Get GPS coordinates (latitude, longitude) from EXIF data for an entry
   */
  getCoordinates(entry: AlbumEntry): { latitude: number; longitude: number } | null {
    // Use the RPC function which handles processed/not processed distinction
    const exif = getExifData(entry);

    // If null, EXIF hasn't been processed yet
    if (exif === null) {
      return null;
    }

    // If empty object, EXIF was processed but has no data
    if (Object.keys(exif).length === 0) {
      return null;
    }

    try {
      const { GPSLatitude, GPSLatitudeRef, GPSLongitudeRef, GPSLongitude } = exif;

      if (
        GPSLatitude &&
        GPSLatitudeRef &&
        GPSLongitudeRef &&
        GPSLongitude
      ) {
        const latitude =
          (GPSLatitudeRef === "N" ? 1 : -1) *
          (GPSLatitude[0] + GPSLatitude[1] / 60 + GPSLatitude[2] / 3600);
        const longitude =
          (GPSLongitudeRef === "E" ? 1 : -1) *
          (GPSLongitude[0] + GPSLongitude[1] / 60 + GPSLongitude[2] / 3600);

        return { latitude, longitude };
      }
    } catch (e) {
      // If parsing fails, return null
    }

    return null;
  }

  /**
   * Get all entries that need geo POI processing (no geo POI data yet)
   */
  getUnprocessedEntries(): Array<{ album_key: string; album_name: string; entry_name: string }> {
    const results = this.getDatabase()
      .prepare(
        `SELECT album_key, album_name, entry_name 
         FROM geo_poi_data 
         WHERE has_geo_poi = 0 OR geo_poi IS NULL
         ORDER BY created_at ASC`
      )
      .all() as Array<{ album_key: string; album_name: string; entry_name: string }>;

    return results;
  }

  // ========== WRITE METHODS (Write operations - READWRITE only) ==========

  /**
   * Create or update an entry in the database (without geo POI data initially)
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
        INSERT INTO geo_poi_data (
          album_key, album_name, entry_name, geo_poi, has_geo_poi, updated_at
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
   * Update geo POI data for an entry
   */
  updateGeoPOI(entry: AlbumEntry, geoPOI: string | null): void {
    if (!this.isWriter) {
      throw new Error("updateGeoPOI can only be called on a READWRITE database instance");
    }

    const db = this.getDatabase();
    try {
      if (entry.album.key === undefined || entry.name === undefined) {
        debugLogger(`Error updating geo POI for ${entry.name}: album.key or name is undefined`);
        return;
      }

      const hasGeoPOI = geoPOI !== null && geoPOI.trim().length > 0 && geoPOI !== '{}' && geoPOI !== '[]';

      const updateStmt = db.prepare(`
        UPDATE geo_poi_data SET
          geo_poi = ?,
          has_geo_poi = ?,
          processed_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
        WHERE album_key = ? AND entry_name = ?
      `);

      const result = updateStmt.run(
        geoPOI,
        hasGeoPOI ? 1 : 0,
        entry.album.key ?? '',
        entry.name ?? ''
      );

      if (result.changes === 0) {
        // Entry doesn't exist, create it
        this.upsertEntry(entry);
        // Try update again
        updateStmt.run(
          geoPOI,
          hasGeoPOI ? 1 : 0,
          entry.album.key ?? '',
          entry.name ?? ''
        );
      }

    } catch (error: any) {
      debugLogger(`Error updating geo POI for ${entry.name}:`, error);
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
    try {
      const deleteStmt = db.prepare(
        `DELETE FROM geo_poi_data WHERE album_key = ? AND entry_name = ?`
      );

      deleteStmt.run(entry.album.key ?? '', entry.name ?? '');
    } catch (error: any) {
      debugLogger(`Error removing entry ${entry.name}:`, error);
      throw error;
    }
  }
}

// Singleton instances
let geolocateDatabaseReadOnly: GeolocateDatabaseAccess | null = null;
let geolocateDatabaseReadWrite: GeolocateDatabaseAccess | null = null;

/**
 * Get the read-only singleton instance of the Geolocate database
 */
export function getGeolocateDatabaseReadOnly(): GeolocateDatabaseAccess {
  if (!geolocateDatabaseReadOnly) {
    geolocateDatabaseReadOnly = new GeolocateDatabaseAccess('READ');
  }
  return geolocateDatabaseReadOnly;
}

/**
 * Get the read-write singleton instance of the Geolocate database
 * Only one instance should exist, typically in the geolocate worker
 */
export function getGeolocateDatabaseReadWrite(): GeolocateDatabaseAccess {
  if (!geolocateDatabaseReadWrite) {
    geolocateDatabaseReadWrite = new GeolocateDatabaseAccess('READWRITE');
  }
  return geolocateDatabaseReadWrite;
}

