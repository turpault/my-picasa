/**
 * Run faces worker: build face scan with picisa_faces.db as write target.
 */
import {
  getFacesEntriesBatchSize,
  getFacesQueueConcurrency,
  getFacesRunMaxMs,
} from "../../../config/worker-batch-config";
import { getEntriesDatabase } from "../../entries/internal/database";
import { getFacesWorkerDatabase } from "./worker-database";
import {
  setFacesWorkerStorage,
  createFacesWorkerStorage,
} from "./face/faces-worker-storage";
import { buildFaceScan } from "./worker-thread";
import { createRunDeadline } from "../../../utils/run-deadline";

export async function runFacesWorker(): Promise<void> {
  getEntriesDatabase();
  getFacesWorkerDatabase();
  setFacesWorkerStorage(createFacesWorkerStorage());

  const concurrency = getFacesQueueConcurrency();
  const deadline = createRunDeadline(getFacesRunMaxMs());

  try {
    await buildFaceScan({
      isExpired: deadline.isExpired,
      facesBatchSize: getFacesEntriesBatchSize(concurrency),
      facesParallelism: concurrency,
    });
  } finally {
    setFacesWorkerStorage(null);
  }
}
