import { join } from "path";
import { isMainThread, Worker } from "worker_threads";

const workers: Map<string, Worker> = new Map();

export function startWorkers() {
  if (!isMainThread) return;

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
    startWorker(service);
  }
}

export function startWorker(serviceName: string): Worker | null {
  if (!isMainThread) return null;
  if (workers.has(serviceName)) return workers.get(serviceName)!;

  console.info(`Starting background worker: ${serviceName}...`);
  const isTs = __filename.endsWith('.ts');
  const workerFile = join(__dirname, 'services', serviceName, isTs ? 'worker.ts' : 'worker.js');

  const worker = new Worker(workerFile, {
    workerData: { serviceName },
    execArgv: isTs ? ["-r", "ts-node/register"] : undefined
  });

  worker.on("error", (err) => {
    console.error(`Worker ${serviceName} error:`, err);
  });

  worker.on("exit", (code) => {
    if (code !== 0) {
      console.error(new Error(`Worker ${serviceName} stopped with exit code ${code}`));
    }
    workers.delete(serviceName);
  });

  workers.set(serviceName, worker);
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

export function broadcast(msg: any, excludeService?: string) {
  for (const [name, worker] of workers) {
    if (name !== excludeService) {
      worker.postMessage(msg);
    }
  }
}
