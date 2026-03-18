import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import { imagesRoot } from "./constants";
import { getEntriesDatabase } from "../services/entries/internal/database";

const LAST_RUN_FILE = join(imagesRoot, ".picisa.last_run");

/**
 * Get the timestamp of the last successful background services run (unix seconds).
 * Returns null if never run or file missing.
 */
export function getLastBackgroundRunAt(): number | null {
  try {
    if (!existsSync(LAST_RUN_FILE)) return null;
    const content = readFileSync(LAST_RUN_FILE, "utf-8").trim();
    const ts = parseInt(content, 10);
    return Number.isNaN(ts) ? null : ts;
  } catch {
    return null;
  }
}

/**
 * Persist the timestamp of the last successful background services run (unix seconds).
 */
export function updateLastRunTimestamp(): void {
  try {
    writeFileSync(LAST_RUN_FILE, String(Math.floor(Date.now() / 1000)), "utf-8");
  } catch (e) {
    console.warn("Failed to write last run timestamp:", e);
  }
}

/**
 * Check if there have been any image/album changes since the last background run.
 * Returns true if we should run background services (changes detected or cold start).
 */
export function hasImageChangesSinceLastRun(): boolean {
  const lastRun = getLastBackgroundRunAt();
  if (lastRun === null) return true;

  try {
    const db = getEntriesDatabase().getDatabase();
    const row = db.prepare(
      `SELECT MAX(CAST(strftime('%s', updated_at) AS INTEGER)) as max_ts FROM album_entries`
    ).get() as { max_ts: number | null } | undefined;
    const maxUpdated = row?.max_ts;

    if (maxUpdated == null) return true;
    return maxUpdated > lastRun;
  } catch {
    return true;
  }
}
