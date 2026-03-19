import debug from "debug";

const debugLogger = debug("app:defer-sync");

const LOG_THRESHOLD_MS = 50;

/**
 * Run a synchronous operation on the next event loop tick via setImmediate.
 * Yields to other operations (HTTP, timers, I/O) so the event loop is not blocked.
 * @param fn - Sync function to run
 * @param label - Optional label for logging when fn takes > LOG_THRESHOLD_MS
 */
export function deferSync<T>(fn: () => T, label?: string): Promise<T> {
  return new Promise((resolve, reject) => {
    setImmediate(() => {
      const start = label ? performance.now() : 0;
      try {
        const result = fn();
        if (label) {
          const elapsed = performance.now() - start;
          if (elapsed > LOG_THRESHOLD_MS) {
            debugLogger("%s took %.0fms", label, elapsed);
          }
        }
        resolve(result);
      } catch (e) {
        if (label) {
          debugLogger("%s threw after %.0fms: %s", label, performance.now() - start, e);
        }
        reject(e);
      }
    });
  });
}
