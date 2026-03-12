import { join } from "path";
import { Worker } from "worker_threads";
import { events } from "../shared/server-events";

const workers: Map<string, Worker> = new Map();

export async function startWorkers() {

  const services = [
    'walker',
    'search',
    'thumbgen',
    'exif',
    'faces',
    'favorite-exporter',
    'geolocate'
  ];

  for (const service of services) {
    await startWorker(service);
  }

  // Subscribe to all server events and forward them to worker threads
  setupEventForwarding();
}

export async function startWorker(serviceName: string): Promise<Worker | null> {
  if (workers.has(serviceName)) return workers.get(serviceName)!;

  console.info(`Starting background worker: ${serviceName}...`);
  const isTs = __filename.endsWith('.ts');
  const workerFile = join(__dirname, 'services', serviceName, isTs ? 'worker.ts' : 'worker.js');
  let resolveFct: (value: void | PromiseLike<void>) => void = () => { };
  let rejectFct: (reason?: any) => void = () => { };
  const readyPromise = new Promise((resolve, reject) => {
    resolveFct = resolve;
    rejectFct = reject;
  });

  const worker = new Worker(workerFile, {
    workerData: { serviceName },
    // No execArgv: run with Bun so workers can use bun:sqlite; Bun runs TS natively
  });

  worker.on("error", (err) => {
    console.error(`Worker ${serviceName} error:`, err);
  });

  worker.on("exit", (code) => {
    if (code !== 0) {
      console.error(new Error(`Worker ${serviceName} stopped with exit code ${code}`));
      rejectFct(code);
    }
    workers.delete(serviceName);
  });

  workers.set(serviceName, worker);
  worker.on("message", (msg) => {
    if (msg.type === "serverEvent" && msg.eventType) {
      events.emit(msg.eventType, msg.data);
    }
    if (msg.type === "ready") {
      resolveFct();
    }
  });

  await readyPromise.then(() => {
    console.info(`Worker ${serviceName} is ready`);
  }).catch((error) => {
    console.error(`Worker ${serviceName} error:`, error);
  });

  return worker;
}

export function getWorker(serviceName: string): Worker | null {
  return workers.get(serviceName) || null;
}

export function getAllWorkers(): Worker[] {
  return Array.from(workers.values());
}

export function postMessageToWorker(serviceName: string, msg: any) {
  const worker = workers.get(serviceName);
  if (worker) {
    worker.postMessage(msg);
  }
}

/**
 * Set up event forwarding between main thread and worker threads
 */
function setupEventForwarding() {
  events.on("*", (eventType: string, data: any) => {
    console.log("Event received:", eventType, data);
    for (const [name, worker] of workers) {
      worker.postMessage({
        type: "serverEvent",
        eventType,
        data,
      });
    }
  });
}
