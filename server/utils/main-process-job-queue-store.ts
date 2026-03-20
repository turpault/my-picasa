import type { JobQueueStore, JobQueuePendingRow } from "./job-queue-store";

/** Human-readable name for logs and debugging. */
export const MAIN_PROCESS_JOB_QUEUE_NAME = "main-process (in-memory)";

type Row = JobQueuePendingRow & { seq: number };

/**
 * In-memory ordering for the main server job queue. Rebuilt on each process start;
 * tasks are still held in the runtime's Map until executed.
 */
export class MainProcessInMemoryJobQueueStore implements JobQueueStore {
  private pending: Row[] = [];
  private seq = 0;

  async reset(): Promise<void> {
    this.pending = [];
    this.seq = 0;
  }

  async addBatch(items: JobQueuePendingRow[]): Promise<void> {
    if (items.length === 0) return;
    for (const it of items) {
      this.pending.push({
        id: it.id,
        priority: it.priority,
        jobType: it.jobType,
        seq: this.seq++,
      });
    }
    this.pending.sort((a, b) => a.priority - b.priority || a.seq - b.seq);
  }

  async pick(): Promise<number | null> {
    const row = this.pending.shift();
    return row?.id ?? null;
  }

  async getPendingCount(): Promise<number> {
    return this.pending.length;
  }

  async getPendingByType(): Promise<Array<{ job_type: string; count: number }>> {
    const counts = new Map<string, number>();
    for (const r of this.pending) {
      const k = String(r.jobType);
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    return [...counts.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([job_type, count]) => ({ job_type, count }));
  }
}
