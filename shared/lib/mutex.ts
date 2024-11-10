export class Mutex {
  constructor() {
    this.current = Promise.resolve();
    this.nest = 0;
  }
  private current: Promise<void>;
  private nest: number;
  lockDate: Date = new Date();
  lock() {
    let _resolve: Function;
    this.lockDate = new Date();
    const p = new Promise<void>((resolve) => {
      _resolve = () => {
        if (Date.now() - this.lockDate.getTime() > 1000) {
          //debugger;
        }
        this.lockDate = new Date();
        this.nest--;
        return resolve();
      };
    });
    // Caller gets a promise that resolves when the current outstanding
    // lock resolves
    const rv = this.current.then(() => _resolve);
    // Don't allow the next request until the new promise is done
    this.current = p;
    // Return the new promise
    this.nest++;
    return rv;
  }
  locked() {
    return this.nest > 0;
  }
  lockCount() {
    return this.nest;
  }
}

export function startLockMonitor() {
  setInterval(checkForVeryLongLocks, 10000);
}

export const locks: Map<string, Mutex> = new Map();
export let lastCheck = Date.now();
export function checkForVeryLongLocks() {
  const now = Date.now();
  if (now < lastCheck + 1000) {
    return;
  }
  lastCheck = now;
  const table = Array.from(locks.entries())
    .filter(([name, mutex]) => mutex.locked())
    .map(([name, mutex]) => ({
      name,
      duration: now - mutex.lockDate.getTime(),
    }))
    .filter((l) => l.duration > 1000);
  if (table.length > 0) {
    console.warn(`${table.length} locks are taking longer than expected`);
    console.table(table.sort((a, b) => b.duration - a.duration).slice(0, 100));
  }
}
export function pruneLocks() {
  // Prune unused mutexes
  for (const [name, mutex] of locks.entries()) {
    if (!mutex.locked()) {
      locks.delete(name);
    }
  }
  checkForVeryLongLocks();
}
export async function lock(label: string): Promise<Function> {
  pruneLocks();
  if (!locks.has(label)) {
    locks.set(label, new Mutex());
  }
  return locks.get(label)!.lock();
}
export function awaiters(label: string): number {
  pruneLocks();
  return locks.get(label)?.lockCount() || 0;
}
export function lockedLocks(): string[] {
  return Array.from(locks)
    .filter((l) => l[1].locked())
    .map((l) => l[0]);
}
