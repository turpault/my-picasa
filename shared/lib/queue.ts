import { buildEmitter, Emitter } from "./event";

export type Task = (() => PromiseLike<any>) | (() => any);

export type QueueEvent = {
  drain: {};
};
export class Queue {
  constructor(concurrency: number = 1, options?: { fifo?: boolean }) {
    this.promises = [];
    this.resolveFct = [];
    this.rejectFct = [];
    this.concurrency = concurrency;
    this.active = 0;
    this.options = options || {};
    this.event = buildEmitter<QueueEvent>();
  }
  add<T>(r: Task): Promise<T> {
    this.promises.push(r);
    return new Promise<T>((resolve, reject) => {
      this.resolveFct.push(resolve);
      this.rejectFct.push(reject);
      this.startIfNeeded();
    });
  }
  clear() {
    this.promises = [];
    const copy = this.resolveFct;
    copy.forEach((p) => p(false));
  }
  async drain() {
    return new Promise<void>((resolve) => {
      this.event.once("drain", () => {
        resolve();
      });
    });
  }
  async startIfNeeded() {
    while (this.active < this.concurrency) {
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
        this.active++;

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
            this.active--;
            if (this.active === 0 && this.promises.length === 0) {
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
  private active: number;
  private options: { fifo?: boolean };
}
