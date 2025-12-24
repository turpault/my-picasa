import { workerData } from "worker_threads";
import { processExifData } from "./internal/worker-thread";
import { events } from "../../events/server-events";

/**
 * Start the EXIF worker
 */
async function startWorker(): Promise<void> {
  await processExifData();
}

// Initialize worker if running in the EXIF worker thread
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

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error(`Worker ${serviceName} uncaught exception:`, error);
  process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error(`Worker ${serviceName} unhandled rejection at:`, promise, 'reason:', reason);
  process.exit(1);
});

process.on("message", (msg: any) => {
  if (msg.type === "serverEvent" && msg.eventType) {
    events.emit(msg.eventType, msg.data);
  }
});

