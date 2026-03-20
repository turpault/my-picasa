/**
 * Run faces worker: build face scan with picisa_faces.db as write target.
 */
import { join } from "path";
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
import { initGlobalJobQueue } from "../../../utils/global-job-queue";
import { createRunDeadline } from "../../../utils/run-deadline";
import { imagesRoot } from "../../../utils/constants";

export async function runFacesWorker(): Promise<void> {
  getEntriesDatabase();
  getFacesWorkerDatabase();
  setFacesWorkerStorage(createFacesWorkerStorage());

  const concurrency = getFacesQueueConcurrency();
  const deadline = createRunDeadline(getFacesRunMaxMs());

  initGlobalJobQueue(concurrency, undefined, {
    queuePath: join(imagesRoot, "picisa_queue_faces.db"),
  });

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
