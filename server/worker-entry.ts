import { parentPort, workerData } from "worker_threads";
import { WorkerAdaptor } from "../../shared/rpc-transport/worker-adaptor";
import { registerServices } from "./rpc/rpc-handler";

if (!parentPort) {
  throw new Error("This file must be run as a worker thread");
}

const serviceName = workerData?.serviceName;
console.info(`Worker thread started for service: ${serviceName}`);

// Set up RPC adaptor for this worker
const adaptor = new WorkerAdaptor();

// Register RPC services based on service name
async function initializeWorkerRPC() {
  switch (serviceName) {
    case 'indexing': {
      const { IndexingWorkerService } = await import("./services/indexing/rpc-service");
      registerServices(adaptor, [IndexingWorkerService], {});
      break;
    }
    // Add other workers here as needed
    // case 'exif': ...
    // case 'thumbnails': ...
    // case 'faces': ...
    // case 'favorites': ...
    // case 'geolocate': ...
    default:
      console.info(`No RPC service defined for worker: ${serviceName}`);
  }
}

// Initialize RPC
initializeWorkerRPC().catch((err) => {
  console.error(`Error initializing RPC for worker ${serviceName}:`, err);
});

// Start worker-specific initialization
if (serviceName === 'walker') {
  const { updateLastWalkLoop } = await import("./services/walker/worker");
  updateLastWalkLoop();
} else {
  const { startBackgroundTasksOnStart } = await import("./services/services/on-start");
  startBackgroundTasksOnStart();
}

