/**
 * Standalone faces database for worker thread.
 * Opens picisa_faces.db and attaches entries for reads.
 */
import { Database } from "bun:sqlite";
import { existsSync } from "fs";
import { FACES_DB_PATH, ENTRIES_DB_PATH } from "../../../utils/db-paths";
import { validateSqliteFileOrQuarantine } from "../../../utils/sqlite-validate";
import type { Album, AlbumEntry, Contact } from "../../../../shared/types/types";

let workerDb: Database | null = null;

export function getFacesWorkerDatabase(): Database {
  if (workerDb) return workerDb;
  validateSqliteFileOrQuarantine(FACES_DB_PATH, "picisa_faces (worker)");
  validateSqliteFileOrQuarantine(ENTRIES_DB_PATH, "picisa_entries (faces worker attach)");
  if (!existsSync(FACES_DB_PATH)) {
    throw new Error("picisa_faces.db does not exist - run main process first to create split DBs");
  }
  workerDb = new Database(FACES_DB_PATH, { readwrite: true });
  workerDb.run("PRAGMA journal_mode=WAL");
  workerDb.run("PRAGMA busy_timeout=10000");
  const escape = (p: string) => p.replace(/'/g, "''");
  workerDb.run(`ATTACH DATABASE '${escape(ENTRIES_DB_PATH)}' AS entries`);
  return workerDb;
}

export function closeFacesWorkerDatabase(): void {
  if (workerDb) {
    workerDb.close();
    workerDb = null;
  }
}

/**
 * Upsert a contact into the faces DB.
 * album_key for a contact is the person key (e.g. person»Name).
 */
export function upsertContact(
  db: Database,
  hash: string,
  albumKey: string,
  contact: Contact
): void {
  db.prepare(`
    INSERT INTO contacts (hash, album_key, id, name, email, something, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(hash, album_key) DO UPDATE SET
      id = excluded.id,
      name = excluded.name,
      email = excluded.email,
      something = excluded.something,
      updated_at = datetime('now')
  `).run(hash, albumKey, contact.id ?? null, contact.name ?? "", contact.email ?? "", contact.something ?? "");
}

/**
 * Upsert a face rect for an entry.
 */
export function upsertFaceRect(
  db: Database,
  entryId: string,
  hash: string,
  rect: string
): void {
  db.prepare(`
    INSERT INTO face_rects (entry_id, hash, rect, updated_at)
    VALUES (?, ?, ?, datetime('now'))
    ON CONFLICT(entry_id, hash) DO UPDATE SET
      rect = excluded.rect,
      updated_at = datetime('now')
  `).run(entryId, hash, rect);
}

/**
 * Get entry_id for an album entry from the attached main DB.
 */
export function getEntryId(db: Database, albumKey: string, entryName: string): string | null {
  const row = db.prepare(
    "SELECT entry_id FROM entries.album_entries WHERE album_key = ? AND entry_name = ?"
  ).get(albumKey, entryName) as { entry_id: string } | undefined;
  return row?.entry_id ?? null;
}
