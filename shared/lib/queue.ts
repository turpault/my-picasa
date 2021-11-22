import { buildEmitter, Emitter } from "./event.js";

export type Task = (() => PromiseLike<any>) | (() => any);

export type QueueEvent = {
  drain: {};
};
export class Queue {
  constructor(concurrency: number = 1, options?: { fifo?: boolean }) {
    this.q = [];
    this.p = [];
    this.r = [];
    this.concurrency = concurrency;
    this.active = 0;
    this.options = options || {};
    this.event = buildEmitter<QueueEvent>();
  }
  add<T>(r: Task): Promise<T> {
    this.q.push(r);
    return new Promise<T>((resolve, reject) => {
      this.p.push(resolve);
      this.r.push(reject);
      this.startIfNeeded();
    });
  }
  clear() {
    this.q = [];
    const copy = this.p;
    copy.forEach((p) => p(false));
  }
  async startIfNeeded() {
    while (this.active < this.concurrency) {
      if (this.q.length > 0) {
        let p: Function;
        let r: Function;
        let t: Task;
        if (this.options.fifo) {
          t = this.q.shift()!;
          p = this.p.shift()!;
          r = this.r.shift()!;
        } else {
          t = this.q.pop()!;
          p = this.p.pop()!;
          r = this.r.pop()!;
        }
        this.active++;

        t()
          .then((v: any) => p(v).catch(() => {}))
          .catch((e: any) => r(e))
          .finally(() => {
            this.active--;
            this.startIfNeeded();
          });
      } else {
        this.event.emit("drain", {});
        // starving....
        break;
      }
    }
  }
  event: Emitter<QueueEvent>;
  private q: Task[];
  private p: ((v: any) => void)[];
  private r: ((v: any) => void)[];
  private concurrency: number;
  private active: number;
  private options: { fifo?: boolean };
}
