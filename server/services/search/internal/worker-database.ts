/**
 * Standalone search database for worker thread.
 * Opens picisa_search.db and attaches entries + exif + geo for reads.
 */
import { Database } from "bun:sqlite";
import { existsSync } from "fs";
import {
  SEARCH_DB_PATH,
  ENTRIES_DB_PATH,
  EXIF_DB_PATH,
  GEO_DB_PATH,
} from "../../../utils/db-paths";

let workerDb: Database | null = null;

export function getSearchWorkerDatabase(): Database {
  if (workerDb) return workerDb;
  if (!existsSync(SEARCH_DB_PATH)) {
    throw new Error("picisa_search.db does not exist - run main process first to create split DBs");
  }
  workerDb = new Database(SEARCH_DB_PATH, { readwrite: true });
  workerDb.run("PRAGMA journal_mode=WAL");
  workerDb.run("PRAGMA busy_timeout=10000");
  const escape = (p: string) => p.replace(/'/g, "''");
  workerDb.run(`ATTACH DATABASE '${escape(ENTRIES_DB_PATH)}' AS entries`);
  workerDb.run(`ATTACH DATABASE '${escape(EXIF_DB_PATH)}' AS exif`);
  workerDb.run(`ATTACH DATABASE '${escape(GEO_DB_PATH)}' AS geo`);
  return workerDb;
}

export function closeSearchWorkerDatabase(): void {
  if (workerDb) {
    workerDb.close();
    workerDb = null;
  }
}
