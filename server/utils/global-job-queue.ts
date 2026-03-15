import debug from "debug";
import { sleep } from "../../shared/lib/utils";
import {
  initQueueDatabase,
  clearQueueDatabase,
  addToQueueBatch,
  pickFromQueue,
  getQueueStats,
  getQueuePendingByType,
} from "./queue-database";
import { hasInteractiveRequestsInFlight } from "./busy";
import { JOB_PRIORITY, type JobType } from "../services/extraction/job-types";

const GLOBAL_QUEUE_CONCURRENCY = 10;
const BATCH_FLUSH_DELAY_MS = 3;
const debugLogger = debug("app:global-queue");

type Task = () => Promise<unknown> | unknown;
type PendingJob = { id: number; priority: number; jobType: JobType };

let pendingBatch: PendingJob[] = [];
let flushScheduled = false;
type QueueItem = { task: Task; resolve: (v: unknown) => void; reject: (e: unknown) => void };

let taskMap: Map<number, QueueItem> | null = null;
let nextId = 1;
let activeCount = 0;
let doneCount = 0;
let extractionStatsCallback: ((stats: { pending: number; active: number; done: number }) => void) | null = null;
let drainResolve: (() => void) | null = null;
let workerRunning = false;

function notifyStats(): void {
  if (extractionStatsCallback) {
    void getQueueStats().then((dbStats) => {
      extractionStatsCallback?.({
        pending: dbStats.pending,
        active: activeCount,
        done: doneCount,
      });
    });
  }
  if (drainResolve) {
    void getQueueStats().then((dbStats) => {
      if (
        dbStats.pending === 0 &&
        activeCount === 0 &&
        pendingBatch.length === 0
      ) {
        drainResolve?.();
        drainResolve = null;
      }
    });
  }
}

async function flushPending(): Promise<void> {
  if (pendingBatch.length === 0) return;
  const batch = pendingBatch;
  pendingBatch = [];
  await addToQueueBatch(
    batch.map(({ id, priority, jobType }) => ({ id, priority, jobType }))
  );
  await sleep(BATCH_FLUSH_DELAY_MS / 1000);
  notifyStats();
}

function scheduleFlush(): void {
  if (flushScheduled) return;
  flushScheduled = true;
  setImmediate(async () => {
    flushScheduled = false;
    await flushPending();
  });
}

async function runWorker(): Promise<void> {
  while (true) {
    while (hasInteractiveRequestsInFlight()) {
      await sleep(50);
    }
    const id = await pickFromQueue();
    if (id === null) {
      notifyStats();
      await new Promise((r) => setTimeout(r, 50));
      continue;
    }

    const item = taskMap?.get(id);
    taskMap?.delete(id);
    if (!item) {
      debugLogger("Task %d not found in map (may have been cleared)", id);
      activeCount--;
      notifyStats();
      continue;
    }

    activeCount++;
    notifyStats();

    const byType = (await getQueuePendingByType()).reduce(
      (acc, { job_type, count }) => {
        acc[job_type] = count;
        return acc;
      },
      {} as Record<string, number>
    );
    const dbStats = await getQueueStats();
    debugLogger(
      "Starting job (id=%d), queue: pending=%d active=%d, pendingByType=%o",
      id,
      dbStats.pending,
      activeCount,
      byType
    );

    try {
      const result = await Promise.resolve(item.task());
      item.resolve(result);
    } catch (e) {
      item.reject(e);
    } finally {
      activeCount--;
      doneCount++;
      notifyStats();
    }
  }
}

function startWorkers(concurrency: number): void {
  if (workerRunning) return;
  workerRunning = true;
  for (let i = 0; i < concurrency; i++) {
    void runWorker();
  }
}

export function initGlobalJobQueue(
  concurrency: number = GLOBAL_QUEUE_CONCURRENCY,
  onStats?: (stats: { pending: number; active: number; done: number }) => void
): void {
  if (taskMap !== null) return;

  initQueueDatabase();
  clearQueueDatabase();
  taskMap = new Map();
  nextId = 1;
  activeCount = 0;
  doneCount = 0;
  extractionStatsCallback = onStats ?? null;

  startWorkers(concurrency);
  debugLogger("Global job queue initialized (concurrency=%d, SQLite-backed)", concurrency);
}

export function addJob<T>(task: () => Promise<T> | T, jobType: JobType): Promise<T> {
  if (!taskMap) {
    throw new Error("Global job queue not initialized");
  }
  const priority = JOB_PRIORITY[jobType] ?? 5;
  const id = nextId++;
  const promise = new Promise<T>((resolve, reject) => {
    taskMap!.set(id, {
      task: task as Task,
      resolve: resolve as (v: unknown) => void,
      reject,
    });
  });
  pendingBatch.push({ id, priority, jobType });
  scheduleFlush();
  return promise;
}

export async function getGlobalQueueStats(): Promise<{
  pending: number;
  active: number;
  done: number;
}> {
  const dbStats = await getQueueStats();
  return {
    pending: dbStats.pending + pendingBatch.length,
    active: activeCount,
    done: doneCount,
  };
}

/** Pending items by job type for stats UI. */
export async function getGlobalQueuePendingByPriority(): Promise<
  Array<{ priority: number; count: number; types: string }>
> {
  const byType = await getQueuePendingByType();
  const priorityMap: Record<number, number> = {};
  for (const { job_type, count } of byType) {
    const prio = JOB_PRIORITY[job_type as JobType] ?? 5;
    priorityMap[prio] = (priorityMap[prio] ?? 0) + count;
  }
  return Object.entries(priorityMap)
    .sort((a, b) => Number(a[0]) - Number(b[0]))
    .map(([priority, count]) => ({
      priority: Number(priority),
      count,
      types: Object.entries(JOB_PRIORITY)
        .filter(([, p]) => p === Number(priority))
        .map(([t]) => t)
        .join(",") || `priority${priority}`,
    }));
}

export async function drainGlobalQueue(): Promise<void> {
  await flushPending();
  const dbStats = await getQueueStats();
  if (dbStats.pending === 0 && activeCount === 0) {
    return;
  }
  return new Promise((resolve) => {
    drainResolve = resolve;
  });
}
