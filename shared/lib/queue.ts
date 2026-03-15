import { buildEmitter, Emitter } from "./event";

export type Task = (() => PromiseLike<any>) | (() => any);

export type QueueEvent = {
  drain: {};
  changed: { waiting: number; progress: number; done: number };
};
/**
 * Queue with configurable concurrency. Defaults to LIFO (last-in-first-out) so
 * most recent requests are served first for faster response times when scrolling.
 */
export class Queue {
  constructor(concurrency: number = 1, options?: { fifo?: boolean }) {
    this.promises = [];
    this.resolveFct = [];
    this.rejectFct = [];
    this.concurrency = concurrency;
    this._active = 0;
    this._total = 0;
    this._done = 0;
    this.options = { fifo: false, ...options };
    this.event = buildEmitter<QueueEvent>(false);
  }
  add<T>(r: Task): Promise<T> {
    this.promises.push(r);
    return new Promise<T>((resolve, reject) => {
      this.resolveFct.push(resolve);
      this.rejectFct.push(reject);
      this._total++;
      this.changed();
      this.startIfNeeded();
    });
  }
  private changed() {
    this.event.emit("changed", {
      waiting: this.promises.length - this._active,
      progress: this._active,
      done: this._total,
    });
  }
  clear() {
    this.promises = [];
    const copy = this.resolveFct;
    copy.forEach((p) => p(false));
  }
  length() {
    return this.promises.length + this._active;
  }
  done() {
    return this._done;
  }
  total() {
    return this._total;
  }
  async drain() {
    if (this._active === 0 && this.length() === 0) {
      return;
    }
    return new Promise<void>((resolve) => {
      this.event.once("drain", () => {
        resolve();
      });
    });
  }
  async startIfNeeded() {
    while (this._active < this.concurrency) {
      if (this.promises.length > 0) {
        let resolver: Function;
        let rejecter: Function;
        let promiseFunctor: Task;
        if (this.options.fifo) {
          promiseFunctor = this.promises.shift()!;
          resolver = this.resolveFct.shift()!;
          rejecter = this.rejectFct.shift()!;
        } else {
          promiseFunctor = this.promises.pop()!;
          resolver = this.resolveFct.pop()!;
          rejecter = this.rejectFct.pop()!;
        }
        this._active++;
        this.changed();

        promiseFunctor()
          .then((v: any) => {
            try {
              resolver(v);
              // Ignore errors occuring while resolving
            } catch {
              debugger;
            }
          })
          .catch((e: any) => rejecter(e))
          .finally(() => {
            this._done++;
            this._active--;
            this.changed();
            if (this._active === 0 && this.promises.length === 0) {
              this.event.emit("drain", {});
            }
            this.startIfNeeded();
          });
      } else {
        // starving....
        break;
      }
    }
  }
  event: Emitter<QueueEvent>;
  private promises: Task[];
  private resolveFct: ((v: any) => void)[];
  private rejectFct: ((v: any) => void)[];
  private concurrency: number;
  private _active: number;
  private _total: number;
  private _done: number;
  private options: { fifo?: boolean };
}

/**
 * Priority queue: picks the item with the lowest priority number first.
 * Within the same priority, FIFO (oldest first).
 * Default priority is 3 (lowest).
 */
export class PriorityQueue {
  private buckets: Map<number, Array<{ task: Task; resolve: (v: any) => void; reject: (e: any) => void }>> = new Map();
  private concurrency: number;
  private _active = 0;
  private _total = 0;
  private _done = 0;
  private defaultPriority = 3;
  event: Emitter<QueueEvent>;

  constructor(concurrency: number = 1, defaultPriority: number = 3) {
    this.concurrency = concurrency;
    this.defaultPriority = defaultPriority;
    this.event = buildEmitter<QueueEvent>(false);
  }

  add<T>(r: Task, priority?: number): Promise<T> {
    const p = priority ?? this.defaultPriority;
    if (!this.buckets.has(p)) {
      this.buckets.set(p, []);
    }
    this.buckets.get(p)!.push({
      task: r,
      resolve: () => {},
      reject: () => {},
    });
    return new Promise<T>((resolve, reject) => {
      const bucket = this.buckets.get(p)!;
      const item = bucket[bucket.length - 1];
      item.resolve = resolve as (v: any) => void;
      item.reject = reject;
      this._total++;
      this.changed();
      this.startIfNeeded();
    });
  }

  private changed(): void {
    const waiting = this.getWaitingCount();
    this.event.emit("changed", {
      waiting,
      progress: this._active,
      done: this._total,
    });
  }

  private getWaitingCount(): number {
    let count = 0;
    for (const bucket of this.buckets.values()) {
      count += bucket.length;
    }
    return count;
  }

  private pickNext(): { task: Task; resolve: (v: any) => void; reject: (e: any) => void } | null {
    const priorities = [...this.buckets.keys()].sort((a, b) => a - b);
    for (const p of priorities) {
      const bucket = this.buckets.get(p)!;
      if (bucket.length > 0) {
        const item = bucket.shift()!;
        if (bucket.length === 0) {
          this.buckets.delete(p);
        }
        return item;
      }
    }
    return null;
  }

  length(): number {
    return this.getWaitingCount() + this._active;
  }

  done(): number {
    return this._done;
  }

  total(): number {
    return this._total;
  }

  async drain(): Promise<void> {
    if (this._active === 0 && this.length() === 0) {
      return;
    }
    return new Promise<void>((resolve) => {
      this.event.once("drain", () => {
        resolve();
      });
    });
  }

  private startIfNeeded(): void {
    while (this._active < this.concurrency) {
      const item = this.pickNext();
      if (!item) break;

      this._active++;
      this.changed();

      Promise.resolve()
        .then(() => item.task())
        .then((v) => {
          try {
            item.resolve(v);
          } catch {
            // ignore
          }
        })
        .catch((e) => item.reject(e))
        .finally(() => {
          this._done++;
          this._active--;
          this.changed();
          if (this._active === 0 && this.getWaitingCount() === 0) {
            this.event.emit("drain", {});
          }
          this.startIfNeeded();
        });
    }
  }
}
