import type { JobType } from "../services/extraction/job-types";

/**
 * Persistence / ordering layer for a job queue. Main process uses in-memory;
 * faces worker uses SQLite (`picisa_queue_faces.db`).
 */
export type JobQueuePendingRow = {
  id: number;
  priority: number;
  jobType: JobType | string;
};

export interface JobQueueStore {
  /** Clear pending rows (tasks stay in the runtime's in-memory map until picked). */
  reset(): Promise<void>;
  addBatch(items: JobQueuePendingRow[]): Promise<void>;
  pick(): Promise<number | null>;
  getPendingCount(): Promise<number>;
  getPendingByType(): Promise<Array<{ job_type: string; count: number }>>;
  close?(): void;
}
