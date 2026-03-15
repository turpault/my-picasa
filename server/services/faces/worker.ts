/**
 * Faces runs in main thread. This file is a stub for backward compatibility.
 * Do not add 'faces' to startWorkers services - it will exit immediately.
 */
import { workerData } from "worker_threads";

const serviceName = workerData?.serviceName ?? "faces";
console.warn(`Faces worker stub: ${serviceName} runs in main thread. Exiting.`);
process.exit(0);
