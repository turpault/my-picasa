import { runGeolocateWorker } from "./internal/worker-thread";
import { startWorkerStatsReporter, stopWorkerStatsReporter } from "../../utils/worker-stats";

const serviceName = process.env.PICISA_SERVICE_NAME ?? "geolocate";
process.title = "picisa-geolocate";

function send(msg: { type: string; data?: unknown }): void {
  if (typeof process.send === "function") process.send(msg);
}

async function main(): Promise<void> {
  send({ type: "ready" });
  startWorkerStatsReporter();
  try {
    await runGeolocateWorker();
  } finally {
    stopWorkerStatsReporter();
  }
  send({ type: "done" });
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
