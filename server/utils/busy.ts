import { hrtime } from "process";
import { sleep } from "../../shared/lib/utils";
import { awaiters, lock } from "../../shared/lib/mutex";

let lastActivity: number = 0;
let activityCounter = 0;
let isWarm = false;

/** CPU load 0–100, updated every second by measureCPULoad. */
let cpuLoadPercent = 0;

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
  return (
    activityCounter === 0 &&
    isWarm === false &&
    new Date().getTime() - lastActivity > 10000
  );
}

export function busy() {
  lastActivity = new Date().getTime();
}

/** CPU load 0–100. */
export function getCpuLoad(): number {
  return cpuLoadPercent;
}

/** Server activity: last activity timestamp (ms) and busy lock count. */
export function getActivityStatus(): { lastActivityMs: number; lockCount: number } {
  return { lastActivityMs: lastActivity, lockCount: activityCounter };
}

export async function measureCPULoad() {
  let prevCpu = process.cpuUsage();
  while (true) {
    const before = hrtime.bigint();
    await sleep(1);
    const after = hrtime.bigint();
    const delay = after - before;
    isWarm = delay > 1005000000n;

    const currCpu = process.cpuUsage();
    const deltaUser = currCpu.user - prevCpu.user;
    const deltaSystem = currCpu.system - prevCpu.system;
    prevCpu = currCpu;
    const cpuPercent = Math.min(100, (deltaUser + deltaSystem) / 10000);
    cpuLoadPercent = cpuPercent;
  }
}
