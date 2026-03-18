import { parentPort, workerData } from "worker_threads";
import { runFtsWorker } from "./internal/run-fts-worker";
import { startWorkerStatsReporter, stopWorkerStatsReporter } from "../../utils/worker-stats";

const serviceName = workerData?.serviceName ?? "fts";

async function main(): Promise<void> {
  parentPort?.postMessage({ type: "ready" });
  startWorkerStatsReporter();
  try {
    await runFtsWorker();
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
