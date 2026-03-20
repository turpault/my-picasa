import debug from "debug";
import { sleep } from "../../shared/lib/utils";
import type { JobQueueStore, JobQueuePendingRow } from "./job-queue-store";
import { hasInteractiveRequestsInFlight } from "./busy";
import { JOB_PRIORITY, type JobType } from "../services/extraction/job-types";

const BATCH_FLUSH_DELAY_MS = 3;

type Task = () => Promise<unknown> | unknown;
type QueueItem = { task: Task; resolve: (v: unknown) => void; reject: (e: unknown) => void };

export type JobQueueRuntime = {
  init: (
    concurrency?: number,
    onStats?: (stats: { pending: number; active: number; done: number }) => void,
  ) => Promise<void>;
  addJob: <T>(task: () => Promise<T> | T, jobType: JobType) => Promise<T>;
  getQueueStats: () => Promise<{ pending: number; active: number; done: number }>;
  getPendingByPriority: () => Promise<
    Array<{ priority: number; count: number; types: string }>
  >;
  drain: () => Promise<void>;
  closeStore?: () => void;
};

export function createJobQueueRuntime(options: {
  /** e.g. app:main-job-queue */
  debugNamespace: string;
  /** Log line description */
  displayName: string;
  store: JobQueueStore;
  defaultConcurrency: number;
}): JobQueueRuntime {
  const { store, defaultConcurrency, displayName, debugNamespace } = options;
  const debugLogger = debug(debugNamespace);

  type PendingJob = JobQueuePendingRow;

  let pendingBatch: PendingJob[] = [];
  let flushScheduled = false;

  let taskMap: Map<number, QueueItem> | null = null;
  let nextId = 1;
  let activeCount = 0;
  let doneCount = 0;
  let extractionStatsCallback: ((stats: { pending: number; active: number; done: number }) => void) | null =
    null;
  let drainResolve: (() => void) | null = null;
  let workerRunning = false;

  async function notifyStats(): Promise<void> {
    const pendingStore = await store.getPendingCount();
    const pendingTotal = pendingStore + pendingBatch.length;
    if (extractionStatsCallback) {
      extractionStatsCallback({
        pending: pendingTotal,
        active: activeCount,
        done: doneCount,
      });
    }
    if (drainResolve) {
      if (pendingStore === 0 && activeCount === 0 && pendingBatch.length === 0) {
        drainResolve();
        drainResolve = null;
      }
    }
  }

  async function flushPending(): Promise<void> {
    if (pendingBatch.length === 0) return;
    const batch = pendingBatch;
    pendingBatch = [];
    await store.addBatch(batch);
    await sleep(BATCH_FLUSH_DELAY_MS / 1000);
    await notifyStats();
  }

  function scheduleFlush(): void {
    if (flushScheduled) return;
    flushScheduled = true;
    setImmediate(() => {
      flushScheduled = false;
      void flushPending();
    });
  }

  async function runWorker(): Promise<void> {
    while (true) {
      while (hasInteractiveRequestsInFlight()) {
        await sleep(50);
      }
      const id = await store.pick();
      if (id === null) {
        await notifyStats();
        await new Promise((r) => setTimeout(r, 50));
        continue;
      }

      const item = taskMap?.get(id);
      taskMap?.delete(id);
      if (!item) {
        debugLogger("Task %d not found in map (may have been cleared)", id);
        activeCount--;
        await notifyStats();
        continue;
      }

      activeCount++;
      await notifyStats();

      const byType = (await store.getPendingByType()).reduce(
        (acc, { job_type, count }) => {
          acc[job_type] = count;
          return acc;
        },
        {} as Record<string, number>,
      );
      const pendingStore = await store.getPendingCount();
      const taskStart = performance.now();
      debugLogger(
        "Starting job (id=%d), queue: pending=%d active=%d, pendingByType=%o [%s]",
        id,
        pendingStore,
        activeCount,
        byType,
        displayName,
      );

      try {
        const result = await Promise.resolve(item.task());
        const taskElapsed = performance.now() - taskStart;
        if (taskElapsed > 500) {
          debugLogger("Job id=%d completed in %.0fms", id, taskElapsed);
        }
        item.resolve(result);
      } catch (e) {
        item.reject(e);
      } finally {
        activeCount--;
        doneCount++;
        await notifyStats();
        await new Promise<void>((r) => setImmediate(r));
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

  return {
    async init(concurrency: number = defaultConcurrency, onStats?) {
      if (taskMap !== null) return;

      await store.reset();
      taskMap = new Map();
      nextId = 1;
      activeCount = 0;
      doneCount = 0;
      extractionStatsCallback = onStats ?? null;

      startWorkers(concurrency);
      debugLogger("%s initialized (concurrency=%d)", displayName, concurrency);
    },

    addJob<T>(task: () => Promise<T> | T, jobType: JobType): Promise<T> {
      if (!taskMap) {
        throw new Error(`${displayName}: job queue not initialized`);
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
    },

    async getQueueStats() {
      const pendingStore = await store.getPendingCount();
      return {
        pending: pendingStore + pendingBatch.length,
        active: activeCount,
        done: doneCount,
      };
    },

    async getPendingByPriority() {
      const fromStore = await store.getPendingByType();
      const priorityMap: Record<number, number> = {};
      for (const { job_type, count } of fromStore) {
        const prio = JOB_PRIORITY[job_type as JobType] ?? 5;
        priorityMap[prio] = (priorityMap[prio] ?? 0) + count;
      }
      for (const j of pendingBatch) {
        const prio = JOB_PRIORITY[j.jobType as JobType] ?? 5;
        priorityMap[prio] = (priorityMap[prio] ?? 0) + 1;
      }
      return Object.entries(priorityMap)
        .sort((a, b) => Number(a[0]) - Number(b[0]))
        .map(([priority, count]) => ({
          priority: Number(priority),
          count,
          types:
            Object.entries(JOB_PRIORITY)
              .filter(([, p]) => p === Number(priority))
              .map(([t]) => t)
              .join(",") || `priority${priority}`,
        }));
    },

    async drain() {
      await flushPending();
      const pendingStore = await store.getPendingCount();
      if (pendingStore === 0 && activeCount === 0) {
        return;
      }
      return new Promise<void>((resolve) => {
        drainResolve = resolve;
      });
    },

    closeStore: store.close?.bind(store),
  };
}
