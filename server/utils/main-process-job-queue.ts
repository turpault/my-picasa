/**
 * Main server process job queue: WALK, THUMBNAIL, REMOVE, UPDATE_ENTRY.
 * Ordering is in-memory (rebuilt on startup); tasks live in the runtime Map until run.
 */
import { createJobQueueRuntime } from "./job-queue-runtime";
import {
  MainProcessInMemoryJobQueueStore,
  MAIN_PROCESS_JOB_QUEUE_NAME,
} from "./main-process-job-queue-store";

export { MAIN_PROCESS_JOB_QUEUE_NAME };

const DEFAULT_CONCURRENCY = 10;

const store = new MainProcessInMemoryJobQueueStore();
const runtime = createJobQueueRuntime({
  debugNamespace: "app:main-job-queue",
  displayName: MAIN_PROCESS_JOB_QUEUE_NAME,
  store,
  defaultConcurrency: DEFAULT_CONCURRENCY,
});

export async function initMainProcessJobQueue(
  concurrency: number = DEFAULT_CONCURRENCY,
  onStats?: (stats: { pending: number; active: number; done: number }) => void,
): Promise<void> {
  await runtime.init(concurrency, onStats);
}

export const addJob = runtime.addJob.bind(runtime);
export const drainGlobalQueue = runtime.drain.bind(runtime);
export const getGlobalQueueStats = runtime.getQueueStats.bind(runtime);
export const getGlobalQueuePendingByPriority = runtime.getPendingByPriority.bind(runtime);
