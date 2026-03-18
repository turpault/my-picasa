/**
 * Helper for child processes to report memory/CPU stats to parent via Bun IPC.
 * Call startWorkerStatsReporter() at the beginning of a worker run.
 * Uses process.send() (available when spawned with Bun.spawn ipc).
 */

export interface WorkerStatsPayload {
  memoryMB: number;
  cpuPercent: number;
  maxMemoryMB: number;
  avgCpuPercent: number;
}

const STATS_INTERVAL_MS = 5000;

let statsInterval: ReturnType<typeof setInterval> | null = null;
let lastCpuUsage: { user: number; system: number } | null = null;
let lastCpuTime = 0;
let maxMemoryMB = 0;
let cpuSamples: number[] = [];
const MAX_CPU_SAMPLES = 60;

export function startWorkerStatsReporter(): void {
  if (statsInterval) return;
  lastCpuUsage = process.cpuUsage();
  lastCpuTime = Date.now();

  statsInterval = setInterval(() => {
    const mem = process.memoryUsage();
    const memMB = mem.rss / 1024 / 1024;
    if (memMB > maxMemoryMB) maxMemoryMB = memMB;

    const now = Date.now();
    const elapsed = (now - lastCpuTime) / 1000;
    const cpu = process.cpuUsage(lastCpuUsage!);
    lastCpuUsage = process.cpuUsage();
    lastCpuTime = now;

    const totalCpuMs = (cpu.user + cpu.system) / 1000;
    const cpuPercent = elapsed > 0 ? Math.min(100, (totalCpuMs / elapsed) * 100) : 0;
    cpuSamples.push(cpuPercent);
    if (cpuSamples.length > MAX_CPU_SAMPLES) cpuSamples.shift();
    const avgCpu = cpuSamples.length
      ? cpuSamples.reduce((a, b) => a + b, 0) / cpuSamples.length
      : 0;

    if (typeof process.send === "function") {
      process.send({
        type: "stats",
        data: {
          memoryMB: Math.round(memMB * 100) / 100,
          cpuPercent: Math.round(cpuPercent * 10) / 10,
          maxMemoryMB: Math.round(maxMemoryMB * 100) / 100,
          avgCpuPercent: Math.round(avgCpu * 10) / 10,
        } as WorkerStatsPayload,
      });
    }
  }, STATS_INTERVAL_MS);
}

export function stopWorkerStatsReporter(): void {
  if (statsInterval) {
    clearInterval(statsInterval);
    statsInterval = null;
  }
}
