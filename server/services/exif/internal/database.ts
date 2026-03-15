import { Database } from "bun:sqlite";
import debug from "debug";
import { AlbumEntry } from "../../../../shared/types/types";
import { getEntriesDatabase } from "../../entries/internal/database";

const debugLogger = debug("app:exif-db");

export type OpenMode = "READ" | "READWRITE";

/** Well-known EXIF/XMP fields stored as separate columns for querying */
export type ExifColumns = {
  date_taken?: string | null;
  make?: string | null;
  model?: string | null;
  image_width?: number | null;
  image_height?: number | null;
  latitude?: number | null;
  longitude?: number | null;
  iso?: number | null;
  exposure_time?: number | null;
  f_number?: number | null;
  focal_length?: number | null;
  person_in_image?: string | null;
  acceleration_vector?: string | null;
  photo_identifier?: string | null;
  image_unique_id?: string | null;
  lens_model?: string | null;
  lens_info?: string | null;
  focal_length_35mm?: number | null;
  gps_altitude?: number | null;
  gps_altitude_ref?: string | null;
  gps_date_stamp?: string | null;
  gps_img_direction?: number | null;
  gps_img_direction_ref?: string | null;
  gps_timestamp?: string | null;
};

/**
 * EXIF database access - uses exif_data table in picisa_entries.db (Phase 3).
 */
export class ExifDatabaseAccess {
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
    // Entries DB is managed by getEntriesDatabase, no per-module close
  }

  canWrite(): boolean {
    return this.isWriter;
  }

  private resolveEntryId(entry: AlbumEntry): string | null {
    const row = this.getDatabase()
      .prepare("SELECT entry_id FROM album_entries WHERE album_key=? AND entry_name=?")
      .get(entry.album.key ?? "", entry.name ?? "") as { entry_id: string } | undefined;
    return row?.entry_id ?? null;
  }

  getExifData(entry: AlbumEntry): string | null {
    const entryId = this.resolveEntryId(entry);
    if (!entryId) return null;
    const result = this.getDatabase()
      .prepare(`SELECT exif_data FROM exif_data WHERE entry_id = ?`)
      .get(entryId) as { exif_data: string | null } | undefined;
    return result?.exif_data ?? null;
  }

  hasExifData(entry: AlbumEntry): boolean {
    const entryId = this.resolveEntryId(entry);
    if (!entryId) return false;
    const result = this.getDatabase()
      .prepare(`SELECT has_exif FROM exif_data WHERE entry_id = ?`)
      .get(entryId) as { has_exif: number } | undefined;
    return (result?.has_exif ?? 0) === 1;
  }

  isProcessed(entry: AlbumEntry): boolean {
    try {
      const entryId = this.resolveEntryId(entry);
      if (!entryId) return false;
      const result = this.getDatabase()
        .prepare(`SELECT processed_at FROM exif_data WHERE entry_id = ?`)
        .get(entryId) as { processed_at: string | null } | undefined;
      return result !== undefined && result.processed_at !== null;
    } catch {
      return false;
    }
  }

  getUnprocessedEntries(): Array<{ album_key: string; album_name: string; entry_name: string }> {
    try {
      return this.getDatabase()
        .prepare(
          `SELECT ae.album_key, a.name AS album_name, ae.entry_name
           FROM album_entries ae
           LEFT JOIN albums a ON ae.album_id = a.album_id
           LEFT JOIN exif_data e ON ae.entry_id = e.entry_id
           WHERE e.entry_id IS NULL
           ORDER BY ae.created_at ASC`
        )
        .all() as Array<{ album_key: string; album_name: string; entry_name: string }>;
    } catch {
      return [];
    }
  }

  getStats(): { totalEntries: number; processedEntries: number; unprocessedEntries: number; lastProcessed: string } {
    const db = this.getDatabase();
    let totalEntries = 0;
    let unprocessedEntries = 0;
    try {
      totalEntries = (db.prepare("SELECT COUNT(*) as count FROM album_entries").get() as { count: number }).count;
    } catch {
      /* */
    }
    const processedEntries = (db.prepare("SELECT COUNT(*) as count FROM exif_data WHERE processed_at IS NOT NULL").get() as { count: number }).count;
    try {
      unprocessedEntries = (db.prepare(`
        SELECT COUNT(*) as count FROM album_entries ae
        LEFT JOIN exif_data e ON ae.entry_id = e.entry_id
        WHERE e.entry_id IS NULL
      `).get() as { count: number }).count;
    } catch {
      /* */
    }
    const lastProcessed = (db.prepare("SELECT MAX(processed_at) as last_processed FROM exif_data WHERE processed_at IS NOT NULL").get() as { last_processed: string | null }).last_processed || "Never";
    return { totalEntries, processedEntries, unprocessedEntries, lastProcessed };
  }

  upsertEntry(entry: AlbumEntry): void {
    if (!this.isWriter) throw new Error("upsertEntry requires READWRITE");
    const entryId = this.resolveEntryId(entry);
    if (!entryId) return;
    this.getDatabase().prepare(`
      INSERT OR REPLACE INTO exif_data (entry_id, exif_data, has_exif, updated_at)
      VALUES (?, NULL, 0, CURRENT_TIMESTAMP)
    `).run(entryId);
  }

  updateExifData(entry: AlbumEntry, exifData: string | null, columns?: ExifColumns): void {
    if (!this.isWriter) throw new Error("updateExifData requires READWRITE");
    const db = this.getDatabase();
    const entryId = this.resolveEntryId(entry);
    if (!entryId) return;
    const hasExif = exifData !== null && exifData.trim().length > 0;
    const cols = columns ?? {};
    const colVals = [
      cols.date_taken ?? null, cols.make ?? null, cols.model ?? null,
      cols.image_width ?? null, cols.image_height ?? null,
      cols.latitude ?? null, cols.longitude ?? null,
      cols.iso ?? null, cols.exposure_time ?? null, cols.f_number ?? null, cols.focal_length ?? null,
      cols.person_in_image ?? null, cols.acceleration_vector ?? null, cols.photo_identifier ?? null,
      cols.image_unique_id ?? null, cols.lens_model ?? null, cols.lens_info ?? null,
      cols.focal_length_35mm ?? null,
      cols.gps_altitude ?? null, cols.gps_altitude_ref ?? null, cols.gps_date_stamp ?? null,
      cols.gps_img_direction ?? null, cols.gps_img_direction_ref ?? null, cols.gps_timestamp ?? null,
    ];
    const result = db.prepare(`
      UPDATE exif_data SET
        exif_data = ?, has_exif = ?, processed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP,
        date_taken = ?, make = ?, model = ?,
        image_width = ?, image_height = ?,
        latitude = ?, longitude = ?,
        iso = ?, exposure_time = ?, f_number = ?, focal_length = ?,
        person_in_image = ?, acceleration_vector = ?, photo_identifier = ?,
        image_unique_id = ?, lens_model = ?, lens_info = ?,
        focal_length_35mm = ?,
        gps_altitude = ?, gps_altitude_ref = ?, gps_date_stamp = ?,
        gps_img_direction = ?, gps_img_direction_ref = ?, gps_timestamp = ?
      WHERE entry_id = ?
    `).run(exifData, hasExif ? 1 : 0, ...colVals, entryId);
    if (result.changes === 0) {
      db.prepare(`
        INSERT INTO exif_data (entry_id, exif_data, has_exif, processed_at, updated_at,
          date_taken, make, model, image_width, image_height, latitude, longitude, iso, exposure_time, f_number, focal_length,
          person_in_image, acceleration_vector, photo_identifier, image_unique_id, lens_model, lens_info, focal_length_35mm,
          gps_altitude, gps_altitude_ref, gps_date_stamp, gps_img_direction, gps_img_direction_ref, gps_timestamp)
        VALUES (?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP,
          ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?, ?)
      `).run(entryId, exifData, hasExif ? 1 : 0, ...colVals);
    }
    debugLogger(`Updated EXIF data for entry ${entry.name}`);
  }

  removeEntry(entry: AlbumEntry): void {
    if (!this.isWriter) throw new Error("removeEntry requires READWRITE");
    const entryId = this.resolveEntryId(entry);
    if (entryId) {
      this.getDatabase().prepare(`DELETE FROM exif_data WHERE entry_id = ?`).run(entryId);
    }
    debugLogger(`Removed entry ${entry.name} from EXIF database`);
  }
}

let readOnlyDbAccess: ExifDatabaseAccess | null = null;
let readWriteDbAccess: ExifDatabaseAccess | null = null;

export function getExifDatabaseReadOnly(): ExifDatabaseAccess {
  if (!readOnlyDbAccess) readOnlyDbAccess = new ExifDatabaseAccess("READ");
  return readOnlyDbAccess;
}

export function getExifDatabaseReadWrite(): ExifDatabaseAccess {
  if (!readWriteDbAccess) readWriteDbAccess = new ExifDatabaseAccess("READWRITE");
  return readWriteDbAccess;
}

export function closeExifDatabase(): void {
  readOnlyDbAccess = null;
  readWriteDbAccess = null;
}
