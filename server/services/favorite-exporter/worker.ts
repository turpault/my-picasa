/**
 * Favorite-exporter runs in main thread as event-driven logic.
 * It is a dependency of metadata changes (picasaEntryUpdated) and new file detection (albumEntryAdded).
 * This stub exists for backward compatibility - do not start as a worker.
 */
import { workerData } from "worker_threads";

const serviceName = workerData?.serviceName ?? "favorite-exporter";
console.warn(`Favorite-exporter stub: ${serviceName} runs in main thread. Exiting.`);
process.exit(0);
