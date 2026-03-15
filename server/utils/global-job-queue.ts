import debug from "debug";
import { PriorityQueue } from "../../shared/lib/queue";
import { JOB_PRIORITY, type JobType } from "../services/extraction/job-types";

const GLOBAL_QUEUE_CONCURRENCY = 10;
const debugLogger = debug("app:global-queue");

/** Reverse map: priority -> job type name(s) for logging. Multiple types can share a priority. */
const PRIORITY_TO_JOB_TYPE: Record<number, string> = {};
for (const [type, prio] of Object.entries(JOB_PRIORITY) as [JobType, number][]) {
  const existing = PRIORITY_TO_JOB_TYPE[prio];
  PRIORITY_TO_JOB_TYPE[prio] = existing ? `${existing},${type}` : type;
}

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
    const byPriority = globalQueue?.getPendingByPriority?.() ?? new Map<number, number>();
    const byType: Record<string, number> = {};
    for (const [p, count] of byPriority) {
      const name = PRIORITY_TO_JOB_TYPE[p] ?? `priority${p}`;
      byType[name] = count;
    }
    debugLogger(
      "Starting job (type=%s), queue: pending=%d active=%d, pendingByType=%o",
      jobType,
      stats.pending,
      stats.active,
      byType
    );
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

/** Pending items by priority for stats UI. Each entry: { priority, count, types } */
export function getGlobalQueuePendingByPriority(): Array<{
  priority: number;
  count: number;
  types: string;
}> {
  if (!globalQueue) {
    return [];
  }
  const byPriority = globalQueue.getPendingByPriority();
  return [...byPriority.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([priority, count]) => ({
      priority,
      count,
      types: PRIORITY_TO_JOB_TYPE[priority] ?? `priority${priority}`,
    }));
}

export function drainGlobalQueue(): Promise<void> {
  if (!globalQueue) {
    return Promise.resolve();
  }
  return globalQueue.drain();
}
