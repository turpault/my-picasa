import { parentPort, workerData } from "worker_threads";

if (workerData?.imagesRoot) {
  process.env.PICISA_PICTURE_FOLDER = workerData.imagesRoot;
}

const serviceName = workerData?.serviceName ?? "favoriteExporter";

async function main(): Promise<void> {
  parentPort?.postMessage({ type: "ready" });
  const { startWorkerStatsReporter, stopWorkerStatsReporter } = await import("../../utils/worker-stats");
  const { runFavoriteExporterWorker } = await import("./internal/run-favorite-exporter-worker");
  startWorkerStatsReporter();
  try {
    await runFavoriteExporterWorker();
  } finally {
    stopWorkerStatsReporter();
  }
  parentPort?.postMessage({ type: "done" });
}

main().catch((err) => {
  console.error(`Worker ${serviceName} error:`, err);
  process.exit(1);
});

process.on("uncaughtException", (err) => {
  console.error(`Worker ${serviceName} uncaughtException:`, err);
  process.exit(1);
});

process.on("unhandledRejection", (reason, promise) => {
  console.error(`Worker ${serviceName} unhandledRejection:`, promise, reason);
  process.exit(1);
});
