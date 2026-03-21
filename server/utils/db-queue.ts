/**
 * Database access queue. Serializes SQLite operations in worker threads and spawned
 * service processes so only one runs at a time, reducing contention.
 *
 * On the primary server process (main thread, no PICISA_SERVICE_NAME), `enqueueDb`
 * runs operations immediately. `enqueueSerializedDb` is for code that still needs a
 * mutex (e.g. parallel writers to the same worker SQLite connection).
 *
 * Separate from the main in-memory job queue (walk/thumbnail/remove/update-entry).
 */
import debug from "debug";
import { isMainThread } from "worker_threads";

const debugLogger = debug("app:db-queue");

const LOG_THRESHOLD_MS = 50;

type Task<T> = {
  fn: () => T | Promise<T>;
  resolve: (v: T) => void;
  reject: (e: unknown) => void;
};

const queue: Task<unknown>[] = [];
let running = false;

/** Worker threads, or Bun-spawned service processes (faces, fts, …), serialize DB access. */
function shouldSerializeDbAccess(): boolean {
  if (!isMainThread) return true;
  return Boolean(process.env.PICISA_SERVICE_NAME?.trim());
}

function runWithOptionalLabel<T>(fn: () => T | Promise<T>, label?: string): Promise<T> {
  try {
    if (!label) {
      return Promise.resolve(fn());
    }
    const t = performance.now();
    const result = fn();
    if (result instanceof Promise) {
      return result.finally(() => {
        if (performance.now() - t > LOG_THRESHOLD_MS) {
          debugLogger("%s took %.0fms", label, performance.now() - t);
        }
      });
    }
    if (performance.now() - t > LOG_THRESHOLD_MS) {
      debugLogger("%s took %.0fms", label, performance.now() - t);
    }
    return Promise.resolve(result);
  } catch (e) {
    return Promise.reject(e);
  }
}

function processNext(): void {
  if (queue.length === 0) {
    running = false;
    return;
  }
  const item = queue.shift()! as Task<unknown>;
  running = true;

  setImmediate(() => {
    const start = performance.now();
    Promise.resolve(item.fn())
      .then((result) => {
        const elapsed = performance.now() - start;
        if (elapsed > LOG_THRESHOLD_MS) {
          debugLogger("db op took %.0fms (pending=%d)", elapsed, queue.length);
        }
        item.resolve(result);
      })
      .catch((e) => {
        item.reject(e);
      })
      .finally(() => {
        processNext();
      });
  });
}

function pushToSerialQueue<T>(fn: () => T | Promise<T>, label?: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const wrapped =
      label &&
      (() => {
        const t = performance.now();
        const result = fn();
        if (result instanceof Promise) {
          return result.finally(() => {
            if (performance.now() - t > LOG_THRESHOLD_MS) {
              debugLogger("%s took %.0fms", label, performance.now() - t);
            }
          });
        }
        if (performance.now() - t > LOG_THRESHOLD_MS) {
          debugLogger("%s took %.0fms", label, performance.now() - t);
        }
        return result;
      });
    queue.push({
      fn: wrapped ?? fn,
      resolve: resolve as (v: unknown) => void,
      reject,
    });
    if (!running) {
      processNext();
    }
  });
}

/**
 * Always one-at-a-time (e.g. faces worker SQLite job queue with concurrent pickers).
 */
export function enqueueSerializedDb<T>(fn: () => T | Promise<T>, label?: string): Promise<T> {
  return pushToSerialQueue(fn, label);
}

/**
 * On the primary server process, runs immediately; in workers / service processes, serializes.
 */
export function enqueueDb<T>(fn: () => T | Promise<T>, label?: string): Promise<T> {
  if (!shouldSerializeDbAccess()) {
    return runWithOptionalLabel(fn, label);
  }
  return pushToSerialQueue(fn, label);
}

/** Pending / active for the serial db-queue (workers / service processes). */
export function getDbQueueStats(): { pending: number; active: number } {
  return {
    pending: queue.length,
    active: running ? 1 : 0,
  };
}
