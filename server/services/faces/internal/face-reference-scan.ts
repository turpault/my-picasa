/**
 * Tracks which entries have completed the face reference-file pass (picisa_faces.db).
 * Used instead of a separate SQLite job-queue file: compare entries vs face_reference_scan,
 * process one page at a time, then prune orphans.
 */
import { Database } from "bun:sqlite";
import { animatedPictureExtensions, pictureExtensions } from "../../../../shared/types/types";
import { enqueueSerializedDb } from "../../../utils/db-queue";

export function pictureLikePatternsForFaceScan(): string[] {
  const staticExts = pictureExtensions.filter((e) => !animatedPictureExtensions.includes(e));
  return staticExts.map((e) => `%.${e}`);
}

export function ensureFaceReferenceScanSchema(db: Database): void {
  db.run(`
    CREATE TABLE IF NOT EXISTS face_reference_scan (
      entry_id TEXT PRIMARY KEY,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
}

export type FaceScanQueueRow = {
  entry_id: string;
  album_key: string;
  album_name: string;
  entry_name: string;
};

/** One page of static picture rows in entries DB that are not yet marked in face_reference_scan. */
export function listPictureEntriesNeedingReferenceScan(db: Database, limit: number): FaceScanQueueRow[] {
  const patterns = pictureLikePatternsForFaceScan();
  if (patterns.length === 0) return [];
  const orClause = patterns.map(() => `lower(ae.entry_name) LIKE ?`).join(" OR ");
  const sql = `
    SELECT ae.entry_id, ae.album_key, a.name AS album_name, ae.entry_name
    FROM entries.album_entries ae
    INNER JOIN entries.albums a ON ae.album_id = a.album_id
    WHERE (${orClause})
    AND NOT EXISTS (
      SELECT 1 FROM face_reference_scan f WHERE f.entry_id = ae.entry_id
    )
    ORDER BY ae.album_key, ae.entry_name
    LIMIT ?
  `;
  return db.prepare(sql).all(...patterns, limit) as FaceScanQueueRow[];
}

export function markFaceReferenceScanDone(db: Database, entryId: string): Promise<void> {
  return enqueueSerializedDb(() => {
    db.prepare(`
      INSERT INTO face_reference_scan (entry_id, updated_at)
      VALUES (?, datetime('now'))
      ON CONFLICT(entry_id) DO UPDATE SET updated_at = datetime('now')
    `).run(entryId);
  }, "face-reference-scan.mark");
}

export function pruneFacesDataForRemovedEntries(db: Database): Promise<void> {
  return enqueueSerializedDb(() => {
    db.prepare(`
      DELETE FROM face_rects
      WHERE entry_id NOT IN (SELECT entry_id FROM entries.album_entries)
    `).run();
    db.prepare(`
      DELETE FROM face_reference_scan
      WHERE entry_id NOT IN (SELECT entry_id FROM entries.album_entries)
    `).run();
  }, "face-reference-scan.prune");
}
