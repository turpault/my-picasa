/// <reference types="bun-types" />
import { join } from "path";
import { initMainProcessJobQueue } from "./utils/main-process-job-queue";
import { setupGlobalJobSchedulers } from "./utils/global-job-schedulers";
import { walkFilesystem, setWalkerReadyResolver } from "./services/walker/internal/walk";
import { runExtractionWorker } from "./services/extraction/internal/operations";
import { buildThumbs } from "./services/thumbgen/internal/build-thumbs";
import { setupFavoriteExporter } from "./services/favorite-exporter/setup";
import { getBackgroundServicesConfig } from "./config/background-services-loader";
import { updateLastRunTimestamp } from "./utils/change-detection";
import type { WorkerStatsPayload } from "./utils/worker-stats";
import { imagesRoot } from "./utils/constants";

/** Last extraction queue stats for /stats API. */
let extractionStats: { pending: number; active: number; done: number } = {
  pending: 0,
  active: 0,
  done: 0,
};

export function getExtractionStats(): { pending: number; active: number; done: number } {
  return extractionStats;
}

/** Worker stats: serviceName -> latest stats payload. */
const workerStats: Record<string, WorkerStatsPayload & { updatedAt: number }> = {};

/** Last run completion time per service (for periodic scheduling). */
const lastRunByService: Record<string, number> = {};

export function updateWorkerStats(serviceName: string, data: WorkerStatsPayload): void {
  workerStats[serviceName] = { ...data, updatedAt: Date.now() };
}

export function getWorkerStats(): Record<string, WorkerStatsPayload> {
  const result: Record<string, WorkerStatsPayload> = {};
  for (const [name, s] of Object.entries(workerStats)) {
    result[name] = {
      memoryMB: s.memoryMB,
      cpuPercent: s.cpuPercent,
      maxMemoryMB: s.maxMemoryMB,
      avgCpuPercent: s.avgCpuPercent,
    };
  }
  return result;
}

/** Resolved when the walker has completed its first filesystem walk and albums are available. */
let walkerReadyResolve: (() => void) | null = null;
export const walkerReadyPromise = new Promise<void>((r) => {
  walkerReadyResolve = r;
});

export function getWalkerReadyPromise(): Promise<void> {
  return walkerReadyPromise;
}

export const BACKGROUND_SERVICE_ORDER = ["faces", "geolocate", "favoriteExporter", "fts"] as const;

/** Tracks which workers are currently running to avoid duplicate starts. */
const runningWorkers = new Set<string>();

function getWorkerPath(serviceName: string): string {
  const base = join(__dirname, "services");
  const paths: Record<string, string> = {
    faces: join(base, "faces", "worker.ts"),
    geolocate: join(base, "geolocate", "worker.ts"),
    favoriteExporter: join(base, "favorite-exporter", "worker.ts"),
    fts: join(base, "search", "worker.ts"),
  };
  const p = paths[serviceName];
  if (!p) throw new Error(`Unknown background service: ${serviceName}`);
  return p;
}

async function runBackgroundWorker(serviceName: string): Promise<void> {
  const config = getBackgroundServicesConfig();
  const svcConfig = config[serviceName as keyof typeof config];
  if (!svcConfig?.enabled) return;

  const workerPath = getWorkerPath(serviceName);
  const child = Bun.spawn([process.execPath, workerPath], {
    cwd: join(__dirname, ".."),
    env: {
      ...process.env,
      PICISA_SERVICE_NAME: serviceName,
      PICISA_PICTURE_FOLDER: imagesRoot,
    },
    ipc(message: { type: string; data?: WorkerStatsPayload }) {
      if (message?.type === "stats" && message.data) {
        updateWorkerStats(serviceName, message.data);
      }
    },
  });

  const code = await child.exited;
  runningWorkers.delete(serviceName);
  if (code !== 0) {
    throw new Error(`Worker ${serviceName} exited with code ${code}`);
  }
  lastRunByService[serviceName] = Date.now();
  updateLastRunTimestamp();
}

async function runAllBackgroundWorkers(): Promise<void> {
  const config = getBackgroundServicesConfig();
  for (const serviceName of BACKGROUND_SERVICE_ORDER) {
    const svcConfig = config[serviceName as keyof typeof config];
    if (!svcConfig?.enabled) continue;
    console.info(`[worker-manager] Starting ${serviceName}...`);
    await runBackgroundWorker(serviceName);
    console.info(`[worker-manager] ${serviceName} done.`);
  }
  updateLastRunTimestamp();
}

/** Start a background worker manually. Returns false if already running or disabled. */
export function startBackgroundWorkerManually(serviceName: string): boolean {
  if (runningWorkers.has(serviceName)) return false;
  const config = getBackgroundServicesConfig();
  const svcConfig = config[serviceName as keyof typeof config];
  if (!svcConfig?.enabled) return false;
  if (!BACKGROUND_SERVICE_ORDER.includes(serviceName as any)) return false;

  runningWorkers.add(serviceName);
  void runBackgroundWorker(serviceName).catch((e) => {
    console.error(`[worker-manager] Manual ${serviceName} failed:`, e);
   });
  return true;
}

/** Start all enabled background workers manually. */
export function startAllBackgroundWorkersManually(): void {
  const config = getBackgroundServicesConfig();
  for (const serviceName of BACKGROUND_SERVICE_ORDER) {
    const svcConfig = config[serviceName as keyof typeof config];
    if (!svcConfig?.enabled) continue;
    startBackgroundWorkerManually(serviceName);
  }
}

export function isWorkerRunning(serviceName: string): boolean {
  return runningWorkers.has(serviceName);
}

export async function startWorkers() {
  const concurrency = parseInt(process.env.PICISA_GLOBAL_QUEUE_CONCURRENCY || "3", 10);
  await initMainProcessJobQueue(concurrency, (stats) => {
    extractionStats = stats;
  });
  setupGlobalJobSchedulers();

  setWalkerReadyResolver(() => {
    walkerReadyResolve?.();
    walkerReadyResolve = null;
  });

  const { getWalkerDatabase } = await import("./services/walker/internal/database");
  getWalkerDatabase();

  void walkFilesystem();
  setTimeout(() => void runExtractionWorker(), 2000);
  void buildThumbs();

  setupFavoriteExporter(getWalkerReadyPromise);

  // Background workers (faces, geolocate, favoriteExporter, fts) are not auto-started.
  // Start them manually from the Management page (/management).
}
