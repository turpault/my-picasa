/**
 * SQLite-backed job queue. Cleared and repopulated on server startup.
 * Stores job ordering (priority, job_type); tasks are held in memory (Map) since they are functions.
 * All DB operations go through the db-queue for serialized access.
 */
import { Database } from "bun:sqlite";
import { join } from "path";
import { imagesRoot } from "./constants";
import debug from "debug";
import { enqueueDb } from "./db-queue";

const debugLogger = debug("app:queue-db");

const DEFAULT_QUEUE_DB_PATH = join(imagesRoot, "picisa_queue.db");

let db: Database | null = null;

export function initQueueDatabase(customPath?: string): void {
  if (db) return;
  const path = customPath ?? DEFAULT_QUEUE_DB_PATH;
  db = new Database(path);
  db.run("PRAGMA journal_mode=WAL");
  db.run("PRAGMA busy_timeout=10000");
  db.run(`
    CREATE TABLE IF NOT EXISTS queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      priority INTEGER NOT NULL,
      job_type TEXT NOT NULL,
      created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    )
  `);
  db.run("CREATE INDEX IF NOT EXISTS idx_queue_pick ON queue(priority, created_at)");
  debugLogger("Queue database initialized at %s", path);
}

export function clearQueueDatabase(): void {
  if (!db) return;
  db.run("DELETE FROM queue");
  debugLogger("Queue database cleared");
}

/** Batch insert jobs in a single transaction. Deferred to next tick. */
export function addToQueueBatch(
  items: Array<{ id: number; priority: number; jobType: string }>
): Promise<void> {
  if (!db) throw new Error("Queue database not initialized");
  if (items.length === 0) return Promise.resolve();
  debugLogger("addToQueueBatch scheduled n=%d", items.length);
  return enqueueDb(
    () => {
      const insert = db!.prepare(
        "INSERT OR IGNORE INTO queue (id, priority, job_type) VALUES (?, ?, ?)"
      );
      const batch = db!.transaction((rows: typeof items) => {
        for (const { id, priority, jobType } of rows) {
          insert.run(id, priority, jobType);
        }
      });
      batch(items);
    },
    `queue.addToQueueBatch(n=${items.length})`
  );
}

/** Atomically pick and remove the next job. Returns id or null if empty. */
export function pickFromQueue(): Promise<number | null> {
  if (!db) return Promise.resolve(null);
  return enqueueDb(
    () => {
      const pick = db!.transaction(() => {
        const row = db!
          .prepare(
            "SELECT id FROM queue ORDER BY priority ASC, created_at ASC LIMIT 1"
          )
          .get() as { id: number } | undefined;
        if (!row) return null;
        db!.prepare("DELETE FROM queue WHERE id = ?").run(row.id);
        return row.id;
      });
      return pick();
    },
    "queue.pickFromQueue"
  );
}

export function getQueueStats(): Promise<{ pending: number }> {
  if (!db) return Promise.resolve({ pending: 0 });
  return enqueueDb(() => {
    const row = db!.prepare("SELECT COUNT(*) as count FROM queue").get() as { count: number };
    return { pending: row?.count ?? 0 };
  });
}

/** Pending count per job type for stats. */
export function getQueuePendingByType(): Promise<Array<{ job_type: string; count: number }>> {
  if (!db) return Promise.resolve([]);
  return enqueueDb(
    () => {
      const rows = db!
        .prepare(
          "SELECT job_type, COUNT(*) as count FROM queue GROUP BY job_type ORDER BY job_type"
        )
        .all() as Array<{ job_type: string; count: number }>;
      return rows;
    },
    "queue.getQueuePendingByType"
  );
}

export function closeQueueDatabase(): void {
  if (db) {
    db.close();
    db = null;
    debugLogger("Queue database closed");
  }
}
