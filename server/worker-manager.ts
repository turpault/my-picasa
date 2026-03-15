import { initGlobalJobQueue } from "./utils/global-job-queue";
import { setupGlobalJobSchedulers } from "./utils/global-job-schedulers";
import { walkFilesystem, setWalkerReadyResolver } from "./services/walker/internal/worker-thread";
import { runExtractionWorker } from "./services/extraction/internal/worker-thread";
import { buildThumbs } from "./services/thumbgen/internal/worker-thread";
import { buildFaceScan } from "./services/faces/internal/worker-thread";
import { setupFavoriteExporter } from "./services/favorite-exporter/internal/export-favorites";

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
}
