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
import { FACES_JOB_QUEUE_DB_PATH } from "../../../utils/db-paths";
import { initFacesJobQueue } from "../../../utils/faces-job-queue";
import { createRunDeadline } from "../../../utils/run-deadline";

export async function runFacesWorker(): Promise<void> {
  getEntriesDatabase();
  getFacesWorkerDatabase();
  setFacesWorkerStorage(createFacesWorkerStorage());

  const concurrency = getFacesQueueConcurrency();
  const deadline = createRunDeadline(getFacesRunMaxMs());

  await initFacesJobQueue(concurrency, FACES_JOB_QUEUE_DB_PATH);

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
