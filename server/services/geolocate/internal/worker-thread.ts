import { AlbumEntry } from "../../../../shared/types/types";
import { enqueueDb } from "../../../utils/db-queue";
import { getLocations } from "./poi/poi-database";
import { getGeolocateDatabaseReadWrite } from "../database";
import { events } from "../../../../shared/server-events";
import debug from "debug";
import { getGeolocateWorkerDatabase } from "./worker-database";
import { initPOIDB } from "./poi/ingest";

const debugLogger = debug("app:bg-geolocate");

/**
 * Process geo POI for an entry and update the database
 * This is called when EXIF data becomes available (via exifDataProcessed event).
 * Exported for use by the extraction worker.
 */
export async function processGeoPOI(entry: AlbumEntry): Promise<void> {
  const db = getGeolocateDatabaseReadWrite();
  try {
    debugLogger(`Processing geo POI for ${entry.name}`);
    const coords = db.getCoordinates(entry);

    if (!coords) {
      // No GPS in exif_data - mark as processed with no POI
      await enqueueDb(
        () => db.updateGeoPOI(entry, null),
        `geolocate.updateGeoPOI(${entry.name},noGPS)`
      );
      return;
    }

    try {
      const geoPOI = await getLocations(coords.latitude, coords.longitude);
      const geoPOIJson = JSON.stringify(geoPOI);
      await enqueueDb(
        () => db.updateGeoPOI(entry, geoPOIJson),
        `geolocate.updateGeoPOI(${entry.name})`
      );
      if (geoPOI && geoPOI.length > 0) {
        events.emit("geoDataFound", entry);
      }
    } catch (e) {
      debugLogger(`Error geolocating ${entry.name}:`, e);
      await enqueueDb(
        () => db.updateGeoPOI(entry, null),
        `geolocate.updateGeoPOI(${entry.name},null)`
      );
    }
  } catch (error) {
    debugLogger(`Error processing geo POI for ${entry.name}:`, error);
    await enqueueDb(
      () => db.updateGeoPOI(entry, null),
      `geolocate.updateGeoPOI(${entry.name},error)`
    );
  }
}

/**
 * Run geolocate worker: process all unprocessed entries.
 * Uses standalone worker database (picisa_geo.db with entries+exif attached).
 */
export async function runGeolocateWorker(): Promise<void> {
  await initPOIDB();
  const db = getGeolocateWorkerDatabase();

  const unprocessed = db.prepare(`
    SELECT ae.album_key, a.name AS album_name, ae.entry_name
    FROM entries.album_entries ae
    LEFT JOIN entries.albums a ON ae.album_id = a.album_id
    LEFT JOIN geo_poi_data g ON ae.album_key = g.album_key AND ae.entry_name = g.entry_name
    WHERE g.album_key IS NULL
    AND EXISTS (SELECT 1 FROM exif.exif_data e WHERE e.entry_id = ae.entry_id AND e.processed_at IS NOT NULL)
    ORDER BY ae.created_at ASC
  `).all() as Array<{ album_key: string; album_name: string; entry_name: string }>;

  debugLogger(`Processing ${unprocessed.length} unprocessed geo entries`);

  for (const row of unprocessed) {
    const entry: AlbumEntry = {
      name: row.entry_name,
      album: { key: row.album_key, name: row.album_name },
    };
    const exifRow = db.prepare(
      "SELECT e.exif_data FROM exif.exif_data e JOIN entries.album_entries ae ON e.entry_id = ae.entry_id WHERE ae.album_key = ? AND ae.entry_name = ?"
    ).get(entry.album.key, entry.name) as { exif_data: string | null } | undefined;
    let exifData: Record<string, unknown> | null = null;
    if (exifRow?.exif_data && exifRow.exif_data.trim()) {
      try {
        exifData = JSON.parse(exifRow.exif_data) as Record<string, unknown>;
      } catch {
        /* skip */
      }
    }
    if (!exifData) continue;

    const { GPSLatitude, GPSLatitudeRef, GPSLongitudeRef, GPSLongitude } = exifData as Record<string, unknown>;
    if (!GPSLatitude || !GPSLatitudeRef || !GPSLongitudeRef || !GPSLongitude) {
      const entryRow = db.prepare("SELECT entry_id FROM entries.album_entries WHERE album_key=? AND entry_name=?").get(entry.album.key, entry.name) as { entry_id: string } | undefined;
      if (entryRow) {
        db.prepare(`
          INSERT OR REPLACE INTO geo_poi_data (entry_id, album_key, entry_name, geo_poi, has_geo_poi, processed_at, updated_at)
          VALUES (?, ?, ?, NULL, 0, datetime('now'), datetime('now'))
        `).run(entryRow.entry_id, entry.album.key, entry.name);
      }
      continue;
    }

    const latArr = Array.isArray(GPSLatitude) ? GPSLatitude : [0, 0, 0];
    const lonArr = Array.isArray(GPSLongitude) ? GPSLongitude : [0, 0, 0];
    const latitude = (GPSLatitudeRef === "N" ? 1 : -1) * (latArr[0] + latArr[1] / 60 + latArr[2] / 3600);
    const longitude = (GPSLongitudeRef === "E" ? 1 : -1) * (lonArr[0] + lonArr[1] / 60 + lonArr[2] / 3600);
    try {
      const geoPOI = await getLocations(latitude, longitude);
      const geoPOIJson = JSON.stringify(geoPOI);
      const entryRow = db.prepare("SELECT entry_id FROM entries.album_entries WHERE album_key=? AND entry_name=?").get(entry.album.key, entry.name) as { entry_id: string } | undefined;
      if (entryRow) {
        db.prepare(`
          INSERT OR REPLACE INTO geo_poi_data (entry_id, album_key, entry_name, geo_poi, has_geo_poi, processed_at, updated_at)
          VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))
        `).run(entryRow.entry_id, entry.album.key, entry.name, geoPOIJson, geoPOI && geoPOI.length > 0 ? 1 : 0);
      }
    } catch (e) {
      debugLogger(`Error geolocating ${entry.name}:`, e);
      const entryRow = db.prepare("SELECT entry_id FROM entries.album_entries WHERE album_key=? AND entry_name=?").get(entry.album.key, entry.name) as { entry_id: string } | undefined;
      if (entryRow) {
        db.prepare(`
          INSERT OR REPLACE INTO geo_poi_data (entry_id, album_key, entry_name, geo_poi, has_geo_poi, processed_at, updated_at)
          VALUES (?, ?, ?, NULL, 0, datetime('now'), datetime('now'))
        `).run(entryRow.entry_id, entry.album.key, entry.name);
      }
    }
  }
  debugLogger("Geolocate worker complete");
}

