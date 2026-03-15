import { workerData } from "worker_threads";
import { runExtractionWorker } from "./internal/worker-thread";
import { events } from "../../../shared/server-events";

async function startWorker(): Promise<void> {
  await runExtractionWorker();
}

const serviceName = workerData.serviceName;
console.info(`Worker thread started for service: ${serviceName}`);
startWorker()
  .then(() => {
    console.info(`Worker ${serviceName} completed successfully`);
    process.exit(0);
  })
  .catch((error) => {
    console.error(`Worker ${serviceName} exited with error:`, error);
    process.exit(1);
  });

process.on("uncaughtException", (error) => {
  console.error(`Worker ${serviceName} uncaught exception:`, error);
  process.exit(1);
});

process.on("unhandledRejection", (reason, promise) => {
  console.error(
    `Worker ${serviceName} unhandled rejection at:`,
    promise,
    "reason:",
    reason
  );
  process.exit(1);
});

process.on("message", (msg: any) => {
  if (msg.type === "serverEvent" && msg.eventType) {
    events.emit(msg.eventType, msg.data);
  }
});
