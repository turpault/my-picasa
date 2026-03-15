import { Database } from "bun:sqlite";
import debug from "debug";
import { AlbumEntry } from "../../../../shared/types/types";
import { getEntriesDatabase } from "../../entries/internal/database";

const debugLogger = debug("app:exif-db");

export type OpenMode = "READ" | "READWRITE";

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

  getExifData(entry: AlbumEntry): string | null {
    const result = this.getDatabase()
      .prepare(`SELECT exif_data FROM exif_data WHERE album_key = ? AND entry_name = ?`)
      .get(entry.album.key ?? "", entry.name ?? "") as { exif_data: string | null } | undefined;
    return result?.exif_data ?? null;
  }

  hasExifData(entry: AlbumEntry): boolean {
    const result = this.getDatabase()
      .prepare(`SELECT has_exif FROM exif_data WHERE album_key = ? AND entry_name = ?`)
      .get(entry.album.key ?? "", entry.name ?? "") as { has_exif: number } | undefined;
    return (result?.has_exif ?? 0) === 1;
  }

  isProcessed(entry: AlbumEntry): boolean {
    try {
      const result = this.getDatabase()
        .prepare(
          `SELECT e.processed_at FROM album_entries ae
           LEFT JOIN exif_data e ON ae.album_key = e.album_key AND ae.entry_name = e.entry_name
           WHERE ae.album_key = ? AND ae.entry_name = ?`
        )
        .get(entry.album.key ?? "", entry.name ?? "") as { processed_at: string | null } | undefined;
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
           LEFT JOIN albums a ON ae.album_key = a.key
           LEFT JOIN exif_data e ON ae.album_key = e.album_key AND ae.entry_name = e.entry_name
           WHERE e.album_key IS NULL
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
        LEFT JOIN exif_data e ON ae.album_key = e.album_key AND ae.entry_name = e.entry_name
        WHERE e.album_key IS NULL
      `).get() as { count: number }).count;
    } catch {
      /* */
    }
    const lastProcessed = (db.prepare("SELECT MAX(processed_at) as last_processed FROM exif_data WHERE processed_at IS NOT NULL").get() as { last_processed: string | null }).last_processed || "Never";
    return { totalEntries, processedEntries, unprocessedEntries, lastProcessed };
  }

  upsertEntry(entry: AlbumEntry): void {
    if (!this.isWriter) throw new Error("upsertEntry requires READWRITE");
    const db = this.getDatabase();
    const entryRow = db.prepare("SELECT entry_id FROM album_entries WHERE album_key=? AND entry_name=?").get(entry.album.key ?? "", entry.name ?? "") as { entry_id: string } | undefined;
    if (!entryRow) return;
    db.prepare(`
      INSERT OR REPLACE INTO exif_data (entry_id, album_key, entry_name, exif_data, has_exif, updated_at)
      VALUES (?, ?, ?, NULL, 0, CURRENT_TIMESTAMP)
    `).run(entryRow.entry_id, entry.album.key ?? "", entry.name ?? "");
  }

  updateExifData(entry: AlbumEntry, exifData: string | null): void {
    if (!this.isWriter) throw new Error("updateExifData requires READWRITE");
    const db = this.getDatabase();
    const hasExif = exifData !== null && exifData.trim().length > 0;
    const result = db.prepare(`
      UPDATE exif_data SET exif_data = ?, has_exif = ?, processed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE album_key = ? AND entry_name = ?
    `).run(exifData, hasExif ? 1 : 0, entry.album.key ?? "", entry.name ?? "");
    if (result.changes === 0) {
      const entryRow = db.prepare("SELECT entry_id FROM album_entries WHERE album_key=? AND entry_name=?").get(entry.album.key ?? "", entry.name ?? "") as { entry_id: string } | undefined;
      if (entryRow) {
        db.prepare(`
          INSERT INTO exif_data (entry_id, album_key, entry_name, exif_data, has_exif, processed_at, updated_at)
          VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        `).run(entryRow.entry_id, entry.album.key ?? "", entry.name ?? "", exifData, hasExif ? 1 : 0);
      }
    }
    debugLogger(`Updated EXIF data for entry ${entry.name}`);
  }

  removeEntry(entry: AlbumEntry): void {
    if (!this.isWriter) throw new Error("removeEntry requires READWRITE");
    this.getDatabase().prepare(`DELETE FROM exif_data WHERE album_key = ? AND entry_name = ?`).run(entry.album.key || "", entry.name || "");
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
