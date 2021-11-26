import { hrtime } from "process";
import { sleep } from "../../shared/lib/utils";

let lastActivity: number = 0;

export function isIdle() {
  return new Date().getTime() - lastActivity > 10000;
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
