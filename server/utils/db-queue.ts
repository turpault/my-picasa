/**
 * Database access queue. Serializes all SQLite operations so only one runs at a time,
 * reducing event-loop blocking from parallel queries.
 * Separate from the global job queue (extraction/thumbgen work).
 */
import debug from "debug";

const debugLogger = debug("app:db-queue");

const LOG_THRESHOLD_MS = 50;

type Task<T> = {
  fn: () => T | Promise<T>;
  resolve: (v: T) => void;
  reject: (e: unknown) => void;
};

const queue: Task<unknown>[] = [];
let running = false;

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

/**
 * Enqueue a database operation. Runs one at a time. Supports sync and async functions.
 */
export function enqueueDb<T>(fn: () => T | Promise<T>, label?: string): Promise<T> {
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

/** Pending = waiting in queue. Active = 1 if an op is running. */
export function getDbQueueStats(): { pending: number; active: number } {
  return {
    pending: queue.length,
    active: running ? 1 : 0,
  };
}
