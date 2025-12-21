import { join } from "path";
import { isMainThread, Worker } from "worker_threads";

let worker: Worker | null = null;

export function startWorker(): Worker | null {
  if (!isMainThread) return null;
  if (worker) return worker;

  console.info("Starting background worker thread...");
  worker = new Worker(join(__dirname, "worker-entry.js"));
  
  worker.on("error", (err) => {
    console.error("Worker error:", err);
  });

  worker.on("exit", (code) => {
    if (code !== 0) {
      console.error(new Error(`Worker stopped with exit code ${code}`));
    }
    worker = null;
  });

  return worker;
}

export function getWorker(): Worker | null {
  return worker;
}

export function postMessageToWorker(msg: any) {
  if (worker) {
    worker.postMessage(msg);
  }
}

