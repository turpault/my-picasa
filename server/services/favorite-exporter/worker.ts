import { workerData } from "worker_threads";
import { buildFavoriteFolder } from "./internal/worker-thread";

/**
 * Start the favorite-exporter worker
 */
async function startWorker(): Promise<void> {
  await buildFavoriteFolder();
}

// Initialize worker if running in the favorite-exporter worker thread
if (workerData?.serviceName === 'favorite-exporter') {
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
}
