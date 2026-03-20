/**
 * SQLite-backed pending row store for the faces worker job queue only (`picisa_queue_faces.db`).
 * Parallel FACE workers serialize access via enqueueSerializedDb.
 */
import { Database } from "bun:sqlite";
import debug from "debug";
import { enqueueSerializedDb } from "./db-queue";
import { FACES_JOB_QUEUE_DB_PATH } from "./db-paths";
import type { JobQueueStore, JobQueuePendingRow } from "./job-queue-store";

const debugLogger = debug("app:faces-job-queue-sqlite");

/** Human-readable name for logs and debugging. */
export const FACES_JOB_QUEUE_SQLITE_NAME = "faces-worker (SQLite)";

export const DEFAULT_FACES_JOB_QUEUE_DB_PATH = FACES_JOB_QUEUE_DB_PATH;

export class FacesJobQueueSqliteStore implements JobQueueStore {
  private db: Database;

  constructor(dbPath: string = DEFAULT_FACES_JOB_QUEUE_DB_PATH) {
    this.db = new Database(dbPath);
    this.db.run("PRAGMA journal_mode=WAL");
    this.db.run("PRAGMA busy_timeout=10000");
    this.db.run(`
      CREATE TABLE IF NOT EXISTS queue (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        priority INTEGER NOT NULL,
        job_type TEXT NOT NULL,
        created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      )
    `);
    this.db.run("CREATE INDEX IF NOT EXISTS idx_queue_pick ON queue(priority, created_at)");
    debugLogger("Faces job queue SQLite at %s", dbPath);
  }

  async reset(): Promise<void> {
    return enqueueSerializedDb(() => {
      this.db.run("DELETE FROM queue");
      debugLogger("Faces job queue table cleared");
    }, "faces-queue.reset");
  }

  async addBatch(items: JobQueuePendingRow[]): Promise<void> {
    if (items.length === 0) return;
    return enqueueSerializedDb(
      () => {
        const insert = this.db.prepare(
          "INSERT OR IGNORE INTO queue (id, priority, job_type) VALUES (?, ?, ?)",
        );
        const batch = this.db.transaction((rows: JobQueuePendingRow[]) => {
          for (const { id, priority, jobType } of rows) {
            insert.run(id, priority, jobType);
          }
        });
        batch(items);
      },
      `faces-queue.addBatch(n=${items.length})`,
    );
  }

  async pick(): Promise<number | null> {
    return enqueueSerializedDb(
      () => {
        const pick = this.db.transaction(() => {
          const row = this.db
            .prepare(
              "SELECT id FROM queue ORDER BY priority ASC, created_at ASC LIMIT 1",
            )
            .get() as { id: number } | undefined;
          if (!row) return null;
          this.db.prepare("DELETE FROM queue WHERE id = ?").run(row.id);
          return row.id;
        });
        return pick();
      },
      "faces-queue.pick",
    );
  }

  async getPendingCount(): Promise<number> {
    return enqueueSerializedDb(() => {
      const row = this.db.prepare("SELECT COUNT(*) as count FROM queue").get() as { count: number };
      return row?.count ?? 0;
    }, "faces-queue.count");
  }

  async getPendingByType(): Promise<Array<{ job_type: string; count: number }>> {
    return enqueueSerializedDb(
      () => {
        return this.db
          .prepare(
            "SELECT job_type, COUNT(*) as count FROM queue GROUP BY job_type ORDER BY job_type",
          )
          .all() as Array<{ job_type: string; count: number }>;
      },
      "faces-queue.byType",
    );
  }

  close(): void {
    this.db.close();
    debugLogger("Faces job queue SQLite closed");
  }
}
