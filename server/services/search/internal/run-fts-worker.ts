/**
 * FTS worker logic - runs in worker thread with standalone search DB.
 */
import debug from "debug";
import { lock } from "../../../../shared/lib/mutex";
import { AlbumEntry } from "../../../../shared/types/types";
import { isPicture, isVideo } from "../../../../shared/lib/utils";
import { getSearchWorkerDatabase } from "./worker-database";
import { getGeoPOI } from "../../geolocate/queries";
import { getEntryMetadata } from "../../walker/queries";
import { getEntriesDatabase } from "../../entries/internal/database";

const debugLogger = debug("app:fts-worker");

export async function runFtsWorker(): Promise<void> {
  getEntriesDatabase().getDatabase();
  const db = getSearchWorkerDatabase();

  const entriesNeedingReindex = db.prepare(`
    SELECT ae.album_key, a.name AS album_name, ae.entry_name
    FROM entries.album_entries ae
    LEFT JOIN pictures p ON ae.album_key = p.album_key AND ae.entry_name = p.entry_name
    LEFT JOIN entries.albums a ON ae.album_id = a.album_id
    WHERE ae.index_version != COALESCE(p.index_version, -1)
  `).all() as Array<{ album_key: string; album_name: string; entry_name: string }>;

  debugLogger(`Reindexing ${entriesNeedingReindex.length} entries`);

  for (const row of entriesNeedingReindex) {
    const entry: AlbumEntry = {
      name: row.entry_name,
      album: { key: row.album_key, name: row.album_name },
    };
    await indexEntry(db, entry);
  }

  const l = await lock("indexAllPictures");
  db.run("UPDATE pictures SET marked = 0");
  const albums = db.prepare("SELECT key, name FROM entries.albums ORDER BY name DESC").all() as Array<{ key: string; name: string }>;
  for (const album of albums) {
    const entries = db.prepare("SELECT entry_name FROM entries.album_entries WHERE album_key = ?").all(album.key) as Array<{ entry_name: string }>;
    for (const e of entries) {
      const entry: AlbumEntry = { name: e.entry_name, album: { key: album.key, name: album.name } };
      await indexEntry(db, entry);
    }
  }
  const countResult = db.prepare("SELECT COUNT(*) as count FROM pictures WHERE marked = 0").get() as { count: number };
  if (countResult.count > 0) {
    db.prepare("DELETE FROM pictures WHERE marked = 0").run();
  }
  l();
  debugLogger("FTS worker complete");
}

async function indexEntry(db: ReturnType<typeof getSearchWorkerDatabase>, entry: AlbumEntry): Promise<void> {
  const metadata = await getEntryMetadata(entry);
  const persons = metadata.persons || "";
  const starCount = metadata.starCount || "";
  const photostar = metadata.photostar || false;
  const textContent = metadata.text || "";
  const caption = metadata.caption || "";
  let geoPOI = "";
  try {
    geoPOI = getGeoPOI(entry) || "";
  } catch {
    /* */
  }
  let entryType = "unknown";
  if (isPicture(entry)) entryType = "picture";
  else if (isVideo(entry)) entryType = "video";

  const entryRow = db.prepare("SELECT entry_id, index_version FROM entries.album_entries WHERE album_key=? AND entry_name=?").get(entry.album.key, entry.name) as { entry_id: string; index_version?: number } | undefined;
  const entryId = entryRow?.entry_id ?? "";
  const indexVersion = entryRow?.index_version ?? 0;

  db.prepare(`
    INSERT OR REPLACE INTO pictures (
      entry_id, album_key, album_name, entry_name,
      persons, star_count, geo_poi, photostar, text_content, caption, entry_type, marked,
      index_version, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, datetime('now'))
  `).run(entryId, entry.album.key, entry.album.name, entry.name, persons, starCount, geoPOI, photostar ? 1 : 0, textContent, caption, entryType, indexVersion);
}
