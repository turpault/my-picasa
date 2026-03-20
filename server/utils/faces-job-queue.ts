/**
 * Faces worker process job queue: FACE jobs only. Persisted in SQLite so ordering
 * survives across in-process restarts of the worker loop (same as before).
 */
import { join } from "path";
import { createJobQueueRuntime, type JobQueueRuntime } from "./job-queue-runtime";
import {
  DEFAULT_FACES_JOB_QUEUE_DB_PATH,
  FacesJobQueueSqliteStore,
  FACES_JOB_QUEUE_SQLITE_NAME,
} from "./faces-job-queue-sqlite-store";
import { imagesRoot } from "./constants";
import type { JobType } from "../services/extraction/job-types";

export { FACES_JOB_QUEUE_SQLITE_NAME, DEFAULT_FACES_JOB_QUEUE_DB_PATH };

const DEFAULT_CONCURRENCY = 5;

let sqliteStore: FacesJobQueueSqliteStore | null = null;
let runtime: JobQueueRuntime | null = null;

export async function initFacesJobQueue(
  concurrency: number = DEFAULT_CONCURRENCY,
  dbPath: string = join(imagesRoot, "picisa_queue_faces.db"),
): Promise<void> {
  if (runtime) return;
  sqliteStore = new FacesJobQueueSqliteStore(dbPath);
  runtime = createJobQueueRuntime({
    debugNamespace: "app:faces-job-queue",
    displayName: FACES_JOB_QUEUE_SQLITE_NAME,
    store: sqliteStore,
    defaultConcurrency: DEFAULT_CONCURRENCY,
  });
  await runtime.init(concurrency);
}

export function addFacesJob<T>(task: () => Promise<T> | T, jobType: JobType): Promise<T> {
  if (!runtime) {
    throw new Error("Faces job queue not initialized");
  }
  return runtime.addJob(task, jobType);
}

export async function drainFacesJobQueue(): Promise<void> {
  if (!runtime) return;
  await runtime.drain();
}

export async function getFacesJobQueueStats(): Promise<{
  pending: number;
  active: number;
  done: number;
}> {
  if (!runtime) {
    return { pending: 0, active: 0, done: 0 };
  }
  return runtime.getQueueStats();
}

export function closeFacesJobQueueStore(): void {
  sqliteStore?.close();
  sqliteStore = null;
  runtime = null;
}
