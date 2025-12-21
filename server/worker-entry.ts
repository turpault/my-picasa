import { parentPort } from "worker_threads";
import { startBackgroundTasksOnStart } from "../worker/background/bg-services-on-start";
import { updateLastWalkLoop } from "./walker";

if (!parentPort) {
  throw new Error("This file must be run as a worker thread");
}

console.info("Worker thread started");

// Start filesystem walker
updateLastWalkLoop();

// Start background services
startBackgroundTasksOnStart();

