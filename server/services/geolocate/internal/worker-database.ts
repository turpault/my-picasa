/**
 * Standalone geolocate database for worker thread.
 * Opens picisa_geo.db and attaches entries + exif for reads.
 */
import { Database } from "bun:sqlite";
import { existsSync } from "fs";
import { GEO_DB_PATH, ENTRIES_DB_PATH, EXIF_DB_PATH } from "../../../utils/db-paths";

let workerDb: Database | null = null;

export function getGeolocateWorkerDatabase(): Database {
  throw new Error("Should not be called");
  if (!existsSync(GEO_DB_PATH)) {
    throw new Error("picisa_geo.db does not exist - run main process first to create split DBs");
  }
  workerDb = new Database(GEO_DB_PATH, { readwrite: true });
  workerDb.run("PRAGMA journal_mode=WAL");
  workerDb.run("PRAGMA busy_timeout=10000");
  const escape = (p: string) => p.replace(/'/g, "''");
  workerDb.run(`ATTACH DATABASE '${escape(ENTRIES_DB_PATH)}' AS entries`);
  workerDb.run(`ATTACH DATABASE '${escape(EXIF_DB_PATH)}' AS exif`);
  return workerDb;
}

export function closeGeolocateWorkerDatabase(): void {
  if (workerDb) {
    workerDb.close();
    workerDb = null;
  }
}
