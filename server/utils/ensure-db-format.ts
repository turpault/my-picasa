import { existsSync, unlinkSync } from "fs";
import { Database } from "bun:sqlite";

export function isDev(): boolean {
  return process.env.NODE_ENV !== "production";
}

/**
 * In dev mode, if the database file exists and is corrupt or has wrong schema,
 * delete it so the next open will create a fresh one.
 * Call this before opening the database in write mode.
 */
export function ensureDbFormatOrRemove(
  dbPath: string,
  check: (db: Database) => void,
): void {
  if (!isDev() || !existsSync(dbPath)) return;
  let db: Database | null = null;
  try {
    db = new Database(dbPath, { readonly: true });
    check(db);
  } catch {
    if (db) {
      try {
        db.close();
      } catch {
        /* ignore */
      }
    }
    unlinkSync(dbPath);
  } finally {
    if (db) {
      try {
        db.close();
      } catch {
        /* ignore */
      }
    }
  }
}
