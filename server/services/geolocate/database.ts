import { Database } from "bun:sqlite";
import debug from "debug";
import { AlbumEntry } from "../../../shared/types/types";
import { getEntriesDatabase } from "../entries/internal/database";

const debugLogger = debug("app:geolocate-db");

export type OpenMode = "READ" | "READWRITE";

/**
 * Geolocate database access - uses geo_poi_data table in picisa_entries.db (Phase 3).
 */
export class GeolocateDatabaseAccess {
  private getDb: () => Database;
  private isWriter: boolean;

  constructor(openMode: OpenMode = "READ") {
    this.isWriter = openMode === "READWRITE";
    this.getDb = () => getEntriesDatabase().getDatabase();
  }

  getDatabase(): Database {
    return this.getDb();
  }

  close(): void {
    // Entries DB is managed by getEntriesDatabase
  }

  canWrite(): boolean {
    return this.isWriter;
  }

  private getGeoTable(): string {
    try {
      this.getDatabase().prepare("SELECT 1 FROM geo.geo_poi_data LIMIT 1").get();
      return "geo.geo_poi_data";
    } catch {
      return "geo_poi_data";
    }
  }

  private getExifTable(): string {
    try {
      this.getDatabase().prepare("SELECT 1 FROM exif.exif_data LIMIT 1").get();
      return "exif.exif_data";
    } catch {
      return "exif_data";
    }
  }

  getGeoPOI(entry: AlbumEntry): string | null {
    const table = this.getGeoTable();
    const result = this.getDatabase()
      .prepare(`SELECT geo_poi FROM ${table} WHERE album_key = ? AND entry_name = ?`)
      .get(entry.album.key ?? "", entry.name ?? "") as { geo_poi: string | null } | undefined;
    return result?.geo_poi ?? null;
  }

  hasGeoPOI(entry: AlbumEntry): boolean {
    const table = this.getGeoTable();
    const result = this.getDatabase()
      .prepare(`SELECT has_geo_poi FROM ${table} WHERE album_key = ? AND entry_name = ?`)
      .get(entry.album.key ?? "", entry.name ?? "") as { has_geo_poi: number } | undefined;
    return (result?.has_geo_poi ?? 0) === 1;
  }

  isProcessed(entry: AlbumEntry): boolean {
    try {
      const table = this.getGeoTable();
      const result = this.getDatabase()
        .prepare(
          `SELECT g.processed_at FROM album_entries ae
           LEFT JOIN ${table} g ON ae.album_key = g.album_key AND ae.entry_name = g.entry_name
           WHERE ae.album_key = ? AND ae.entry_name = ?`
        )
        .get(entry.album.key ?? "", entry.name ?? "") as { processed_at: string | null } | undefined;
      return result !== undefined && result.processed_at !== null;
    } catch {
      return false;
    }
  }

  /**
   * Read latitude/longitude from exif_data table (entries DB, read-only).
   * Returns null if entry has no GPS data in the database.
   */
  getCoordinates(entry: AlbumEntry): { latitude: number; longitude: number } | null {
    try {
      const table = this.getExifTable();
      const result = this.getDatabase()
        .prepare(
          `SELECT e.latitude, e.longitude
           FROM album_entries ae
           JOIN ${table} e ON ae.entry_id = e.entry_id
           WHERE ae.album_key = ? AND ae.entry_name = ?
             AND e.latitude IS NOT NULL AND e.longitude IS NOT NULL`
        )
        .get(entry.album.key ?? "", entry.name ?? "") as
        | { latitude: number; longitude: number }
        | undefined;
      if (result && typeof result.latitude === "number" && typeof result.longitude === "number") {
        return result;
      }
    } catch {
      /* */
    }
    return null;
  }

  getUnprocessedEntries(): Array<{ album_key: string; album_name: string; entry_name: string }> {
    try {
      const table = this.getGeoTable();
      return this.getDatabase()
        .prepare(
          `SELECT ae.album_key, a.name AS album_name, ae.entry_name
           FROM album_entries ae
           LEFT JOIN albums a ON ae.album_id = a.album_id
           LEFT JOIN ${table} g ON ae.album_key = g.album_key AND ae.entry_name = g.entry_name
           WHERE g.album_key IS NULL
           ORDER BY ae.created_at ASC`
        )
        .all() as Array<{ album_key: string; album_name: string; entry_name: string }>;
    } catch {
      return [];
    }
  }

  upsertEntry(entry: AlbumEntry): void {
    if (!this.isWriter) throw new Error("upsertEntry requires READWRITE");
    const db = this.getDatabase();
    const table = this.getGeoTable();
    const entryRow = db.prepare("SELECT entry_id FROM album_entries WHERE album_key=? AND entry_name=?").get(entry.album.key ?? "", entry.name ?? "") as { entry_id: string } | undefined;
    if (!entryRow) return;
    db.prepare(`
      INSERT OR REPLACE INTO ${table} (entry_id, album_key, entry_name, geo_poi, has_geo_poi, updated_at)
      VALUES (?, ?, ?, NULL, 0, CURRENT_TIMESTAMP)
    `).run(entryRow.entry_id, entry.album.key ?? "", entry.name ?? "");
  }

  updateGeoPOI(entry: AlbumEntry, geoPOI: string | null): void {
    if (!this.isWriter) throw new Error("updateGeoPOI requires READWRITE");
    const db = this.getDatabase();
    const table = this.getGeoTable();
    const hasGeoPOI = geoPOI !== null && geoPOI.trim().length > 0 && geoPOI !== "{}" && geoPOI !== "[]";
    const result = db.prepare(`
      UPDATE ${table} SET geo_poi = ?, has_geo_poi = ?, processed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE album_key = ? AND entry_name = ?
    `).run(geoPOI, hasGeoPOI ? 1 : 0, entry.album.key ?? "", entry.name ?? "");
    if (result.changes === 0) {
      const entryRow = db.prepare("SELECT entry_id FROM album_entries WHERE album_key=? AND entry_name=?").get(entry.album.key ?? "", entry.name ?? "") as { entry_id: string } | undefined;
      if (entryRow) {
        db.prepare(`
          INSERT INTO ${table} (entry_id, album_key, entry_name, geo_poi, has_geo_poi, processed_at, updated_at)
          VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        `).run(entryRow.entry_id, entry.album.key ?? "", entry.name ?? "", geoPOI, hasGeoPOI ? 1 : 0);
      }
    }
  }

  removeEntry(entry: AlbumEntry): void {
    if (!this.isWriter) throw new Error("removeEntry requires READWRITE");
    const table = this.getGeoTable();
    this.getDatabase().prepare(`DELETE FROM ${table} WHERE album_key = ? AND entry_name = ?`).run(entry.album.key ?? "", entry.name ?? "");
  }
}

let geolocateDatabaseReadOnly: GeolocateDatabaseAccess | null = null;
let geolocateDatabaseReadWrite: GeolocateDatabaseAccess | null = null;

export function getGeolocateDatabaseReadOnly(): GeolocateDatabaseAccess {
  if (!geolocateDatabaseReadOnly) geolocateDatabaseReadOnly = new GeolocateDatabaseAccess("READ");
  return geolocateDatabaseReadOnly;
}

export function getGeolocateDatabaseReadWrite(): GeolocateDatabaseAccess {
  if (!geolocateDatabaseReadWrite) geolocateDatabaseReadWrite = new GeolocateDatabaseAccess("READWRITE");
  return geolocateDatabaseReadWrite;
}
