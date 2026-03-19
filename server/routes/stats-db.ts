/**
 * Stats DB routes - list contents of picisa_entries and poi databases for the stats UI.
 */
import { enqueueDb } from "../utils/db-queue";

const DEFAULT_LIMIT = 200;

function getTableContents(
  db: import("bun:sqlite").Database,
  limit: number = DEFAULT_LIMIT
): Record<string, unknown[]> {
  const tables = db
    .prepare(
      `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`
    )
    .all() as { name: string }[];

  const result: Record<string, unknown[]> = {};
  for (const { name } of tables) {
    try {
      const rows = db.prepare(`SELECT * FROM ${name} LIMIT ?`).all(limit);
      result[name] = rows as unknown[];
    } catch (e) {
      result[name] = [{ _error: String(e) }];
    }
  }
  return result;
}

export async function getEntriesDbContents(
  limit: number = DEFAULT_LIMIT
): Promise<Record<string, unknown[]>> {
  return enqueueDb(async () => {
    const { getWalkerDatabase } = await import(
      "../services/walker/internal/database"
    );
    const db = getWalkerDatabase().getDatabase();
    return getTableContents(db, limit);
  }, "stats.getEntriesDbContents");
}

export async function getPoiDbContents(
  limit: number = DEFAULT_LIMIT
): Promise<Record<string, unknown[]>> {
  return enqueueDb(async () => {
    const { getPoiDb } = await import("../services/geolocate/poi");
    const db = getPoiDb();
    return getTableContents(db, limit);
  }, "stats.getPoiDbContents");
}
