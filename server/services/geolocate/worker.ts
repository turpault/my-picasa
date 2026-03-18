import { parentPort, workerData } from "worker_threads";
import { runGeolocateWorker } from "./internal/worker-thread";
import { startWorkerStatsReporter, stopWorkerStatsReporter } from "../../utils/worker-stats";

const serviceName = workerData?.serviceName ?? "geolocate";

async function main(): Promise<void> {
  parentPort?.postMessage({ type: "ready" });
  startWorkerStatsReporter();
  try {
    await runGeolocateWorker();
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
