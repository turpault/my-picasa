/**
 * Run a synchronous operation on the next event loop tick via setImmediate.
 * Yields to other operations (HTTP, timers, I/O) so the event loop is not blocked.
 */
export function deferSync<T>(fn: () => T): Promise<T> {
  return new Promise((resolve, reject) => {
    setImmediate(() => {
      try {
        resolve(fn());
      } catch (e) {
        reject(e);
      }
    });
  });
}
