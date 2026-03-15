import debug from "debug";
import { PriorityQueue } from "../../shared/lib/queue";
import { JOB_PRIORITY, type JobType } from "../services/extraction/job-types";

const GLOBAL_QUEUE_CONCURRENCY = 10;
const debugLogger = debug("app:global-queue");

let globalQueue: PriorityQueue | null = null;
let extractionStatsCallback: ((stats: { pending: number; active: number; done: number }) => void) | null = null;

export function initGlobalJobQueue(
  concurrency: number = GLOBAL_QUEUE_CONCURRENCY,
  onStats?: (stats: { pending: number; active: number; done: number }) => void
): void {
  if (globalQueue) {
    return;
  }
  globalQueue = new PriorityQueue(concurrency, 5); // default priority 5
  extractionStatsCallback = onStats ?? null;
  globalQueue.event.on("changed", () => {
    if (extractionStatsCallback && globalQueue) {
      extractionStatsCallback(globalQueue.getStats());
    }
  });
}

export function addJob<T>(task: () => Promise<T> | T, jobType: JobType): Promise<T> {
  if (!globalQueue) {
    throw new Error("Global job queue not initialized");
  }
  const priority = JOB_PRIORITY[jobType] ?? 5;
  const wrappedTask = async () => {
    const stats = getGlobalQueueStats();
    debugLogger("Starting job (type=%s), queue: pending=%d active=%d", jobType, stats.pending, stats.active);
    return Promise.resolve(task());
  };
  return globalQueue.add(wrappedTask, priority);
}

export function getGlobalQueueStats(): { pending: number; active: number; done: number } {
  if (!globalQueue) {
    return { pending: 0, active: 0, done: 0 };
  }
  return globalQueue.getStats();
}

export function drainGlobalQueue(): Promise<void> {
  if (!globalQueue) {
    return Promise.resolve();
  }
  return globalQueue.drain();
}
