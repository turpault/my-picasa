/**
 * On startup, detect malformed SQLite files (e.g. SQLITE_CORRUPT_INDEX), quarantine them,
 * and let the next open create a fresh derived database where applicable.
 */
import { existsSync, renameSync, unlinkSync } from "fs";
import { Database } from "bun:sqlite";
import debug from "debug";
import {
  ENTRIES_DB_PATH,
  EXIF_DB_PATH,
  FACES_DB_PATH,
  FACES_JOB_QUEUE_DB_PATH,
  GEO_DB_PATH,
  POI_DB_PATH,
  SEARCH_DB_PATH,
  WALKER_DB_PATH,
} from "./db-paths";

const debugLogger = debug("app:sqlite-validate");

function isQuickCheckOk(db: Database): boolean {
  try {
    const rows = db.prepare("PRAGMA quick_check").all() as Array<Record<string, unknown>>;
    if (!rows?.length) return false;
    if (rows.length !== 1) return false;
    const row = rows[0];
    const v = row.quick_check ?? Object.values(row)[0];
    return v === "ok";
  } catch {
    return false;
  }
}

function quarantineFile(dbPath: string, label: string, cause: unknown): void {
  debugLogger("Quarantining corrupt DB (%s): %s — %s", label, dbPath, cause);
  console.warn(`[picisa] SQLite validation failed (${label}): ${dbPath}`, cause);
  try {
    const bak = `${dbPath}.corrupt-${Date.now()}.bak`;
    renameSync(dbPath, bak);
    console.warn(`[picisa] Renamed corrupt database to ${bak} (a new file will be created if needed)`);
  } catch {
    try {
      unlinkSync(dbPath);
      console.warn(`[picisa] Removed corrupt database (could not rename): ${dbPath}`);
    } catch (unlinkErr) {
      console.error(`[picisa] Could not quarantine corrupt database ${dbPath}:`, unlinkErr);
      throw cause;
    }
  }
}

/**
 * Open read-only, run PRAGMA quick_check. On failure or open error, rename/remove the file.
 */
export function validateSqliteFileOrQuarantine(dbPath: string, label: string): void {
  if (!existsSync(dbPath)) return;
  let db: Database | null = null;
  try {
    db = new Database(dbPath, { readonly: true });
    if (!isQuickCheckOk(db)) {
      throw new Error("PRAGMA quick_check did not return ok");
    }
  } catch (e) {
    try {
      db?.close();
    } catch {
      /* ignore */
    }
    db = null;
    quarantineFile(dbPath, label, e);
  } finally {
    try {
      db?.close();
    } catch {
      /* ignore */
    }
  }
}

/** Core Picasa library DB files used by the main entries DB and walker migration. */
export function validatePicisaCoreSqliteFiles(): void {
  const paths: Array<[string, string]> = [
    [ENTRIES_DB_PATH, "picisa_entries"],
    [EXIF_DB_PATH, "picisa_exif"],
    [GEO_DB_PATH, "picisa_geo"],
    [FACES_DB_PATH, "picisa_faces"],
    [SEARCH_DB_PATH, "picisa_search"],
    [WALKER_DB_PATH, "picisa_walker"],
    [POI_DB_PATH, "poi"],
    [FACES_JOB_QUEUE_DB_PATH, "picisa_queue_faces"],
  ];
  for (const [p, label] of paths) {
    validateSqliteFileOrQuarantine(p, label);
  }
}
