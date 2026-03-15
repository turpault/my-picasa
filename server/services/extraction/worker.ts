/**
 * Extraction runs in main thread. This file is a stub for backward compatibility.
 * Do not add 'extraction' to startWorkers services - it will exit immediately.
 */
import { workerData } from "worker_threads";

const serviceName = workerData?.serviceName ?? "extraction";
console.warn(`Extraction worker stub: ${serviceName} runs in main thread. Exiting.`);
process.exit(0);
