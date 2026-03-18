/// <reference types="bun-types" />
import { join } from "path";
import { initGlobalJobQueue } from "./utils/global-job-queue";
import { setupGlobalJobSchedulers } from "./utils/global-job-schedulers";
import { walkFilesystem, setWalkerReadyResolver } from "./services/walker/internal/worker-thread";
import { runExtractionWorker } from "./services/extraction/internal/worker-thread";
import { buildThumbs } from "./services/thumbgen/internal/worker-thread";
import { setupFavoriteExporter } from "./services/favorite-exporter/internal/export-favorites";
import { getBackgroundServicesConfig } from "./config/background-services-loader";
import {
  hasImageChangesSinceLastRun,
  updateLastRunTimestamp,
} from "./utils/change-detection";
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

const BACKGROUND_SERVICE_ORDER = ["faces", "geolocate", "favoriteExporter", "fts"] as const;

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
  if (code !== 0) {
    throw new Error(`Worker ${serviceName} exited with code ${code}`);
  }
  lastRunByService[serviceName] = Date.now();
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

function schedulePeriodicBackgroundWorkers(): void {
  const config = getBackgroundServicesConfig();
  const intervalMs = 60 * 1000;

  setInterval(async () => {
    if (!hasImageChangesSinceLastRun()) return;

    for (const serviceName of BACKGROUND_SERVICE_ORDER) {
      const svcConfig = config[serviceName as keyof typeof config];
      if (!svcConfig?.enabled) continue;
      const mins = svcConfig.intervalMinutes;
      const lastRun = lastRunByService[serviceName] ?? 0;
      if (Date.now() - lastRun < mins * 60 * 1000) continue;

      try {
        console.info(`[worker-manager] Periodic run: ${serviceName}...`);
        await runBackgroundWorker(serviceName);
        updateLastRunTimestamp();
      } catch (e) {
        console.error(`[worker-manager] Periodic ${serviceName} failed:`, e);
      }
    }
  }, intervalMs);
}

export async function startWorkers() {
  const concurrency = parseInt(process.env.PICISA_GLOBAL_QUEUE_CONCURRENCY || "3", 10);
  initGlobalJobQueue(concurrency, (stats) => {
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

  getWalkerReadyPromise().then(async () => {
    if (!hasImageChangesSinceLastRun()) {
      console.info("[worker-manager] No image changes since last run, skipping background workers.");
      return;
    }
    try {
      await runAllBackgroundWorkers();
      console.info("[worker-manager] All background workers completed.");
    } catch (e) {
      console.error("[worker-manager] Background workers failed:", e);
    }
  });

  schedulePeriodicBackgroundWorkers();
}
