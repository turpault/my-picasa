import { hrtime } from "process";
import { sleep } from "../../shared/lib/utils";
import { awaiters, lock } from "../../shared/lib/mutex";

let lastActivity: number = 0;
let activityCounter = 0;

export function lockIdleWorkers() {
  activityCounter++;
  busy();
}
export function releaseIdleWorkers() {
  activityCounter--;
  busy();
}

export async function waitUntilIdle() {
  while (!isIdle()) {
    await sleep(1);
  }
}

export function isIdle() {
  return activityCounter === 0 && new Date().getTime() - lastActivity > 10000;
}

export function busy() {
  lastActivity = new Date().getTime();
}

export async function measureCPULoad() {
  while (true) {
    const before = hrtime.bigint();
    await sleep(1);
    const after = hrtime.bigint();
    const delay = after - before;
    if (delay > 1005000000n) {
      busy();
    }
  }
}
