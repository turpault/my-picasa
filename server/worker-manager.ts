import { join } from "path";
import { Worker } from "worker_threads";
import { events } from "../shared/server-events";
import { initGlobalJobQueue } from "./utils/global-job-queue";
import { setupGlobalJobSchedulers } from "./utils/global-job-schedulers";
import { walkFilesystem, setWalkerReadyResolver } from "./services/walker/internal/worker-thread";
import { runExtractionWorker } from "./services/extraction/internal/worker-thread";
import { buildThumbs } from "./services/thumbgen/internal/worker-thread";
import { buildFaceScan } from "./services/faces/internal/worker-thread";
import { setupFavoriteExporter } from "./services/favorite-exporter/internal/export-favorites";

const workers: Map<string, Worker> = new Map();

/** Last extraction queue stats for /stats API. */
let extractionStats: { pending: number; active: number; done: number } = {
  pending: 0,
  active: 0,
  done: 0,
};

export function getExtractionStats(): { pending: number; active: number; done: number } {
  return extractionStats;
}

/** Resolved when the walker has completed its first filesystem walk and albums are available. */
let walkerReadyResolve: (() => void) | null = null;
export const walkerReadyPromise = new Promise<void>((r) => {
  walkerReadyResolve = r;
});

export function getWalkerReadyPromise(): Promise<void> {
  return walkerReadyPromise;
}

export async function startWorkers() {
  const concurrency = parseInt(process.env.PICISA_GLOBAL_QUEUE_CONCURRENCY || "10", 10);
  initGlobalJobQueue(concurrency, (stats) => {
    extractionStats = stats;
  });
  setupGlobalJobSchedulers();

  setWalkerReadyResolver(() => {
    walkerReadyResolve?.();
    walkerReadyResolve = null;
  });

  // Initialize entries DB in main thread first (needs READ-WRITE for migrations)
  const { getWalkerDatabase } = await import("./services/walker/internal/database");
  getWalkerDatabase();

  // Run walker, extraction, thumbgen, faces in main thread
  void walkFilesystem();
  void runExtractionWorker();
  void buildThumbs();
  void buildFaceScan();

  // Favorite-exporter: event-driven, runs on metadata changes and new file detection
  setupFavoriteExporter(getWalkerReadyPromise);

  setupEventForwarding();
}

export async function startWorker(serviceName: string): Promise<Worker | null> {
  if (workers.has(serviceName)) return workers.get(serviceName)!;

  console.info(`Starting background worker: ${serviceName}...`);
  const isTs = __filename.endsWith('.ts');
  const workerFile = join(__dirname, 'services', serviceName, isTs ? 'worker.ts' : 'worker.js');
  let resolveFct: (value: void | PromiseLike<void>) => void = () => { };
  let rejectFct: (reason?: any) => void = () => { };
  const readyPromise = new Promise((resolve, reject) => {
    resolveFct = resolve;
    rejectFct = reject;
  });

  const worker = new Worker(workerFile, {
    workerData: { serviceName },
    // No execArgv: run with Bun so workers can use bun:sqlite; Bun runs TS natively
  });

  worker.on("error", (err) => {
    console.error(`Worker ${serviceName} error:`, err);
  });

  worker.on("exit", (code) => {
    if (code !== 0) {
      console.error(new Error(`Worker ${serviceName} stopped with exit code ${code}`));
      rejectFct(code);
    }
    workers.delete(serviceName);
  });

  workers.set(serviceName, worker);
  worker.on("message", (msg) => {
    if (msg.type === "serverEvent" && msg.eventType) {
      events.emit(msg.eventType, msg.data);
    }
    if (msg.type === "ready") {
      resolveFct();
    }
  });

  await readyPromise.then(() => {
    console.info(`Worker ${serviceName} is ready`);
  }).catch((error) => {
    console.error(`Worker ${serviceName} error:`, error);
  });

  return worker;
}

export function getWorker(serviceName: string): Worker | null {
  return workers.get(serviceName) || null;
}

export function getAllWorkers(): Worker[] {
  return Array.from(workers.values());
}

export function postMessageToWorker(serviceName: string, msg: any) {
  const worker = workers.get(serviceName);
  if (worker) {
    worker.postMessage(msg);
  }
}

/**
 * Set up event forwarding between main thread and worker threads
 */
function setupEventForwarding() {
  events.on("*", (eventType: string, data: any) => {
    console.log("Event received:", eventType, data);
    for (const [name, worker] of workers) {
      worker.postMessage({
        type: "serverEvent",
        eventType,
        data,
      });
    }
  });
}
