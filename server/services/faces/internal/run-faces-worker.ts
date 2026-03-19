/**
 * Run faces worker: build face scan with picisa_faces.db as write target.
 */
import { join } from "path";
import { getEntriesDatabase } from "../../entries/internal/database";
import { getFacesWorkerDatabase } from "./worker-database";
import {
  setFacesWorkerStorage,
  createFacesWorkerStorage,
} from "./face/faces-worker-storage";
import { buildFaceScan } from "./worker-thread";
import { initGlobalJobQueue } from "../../../utils/global-job-queue";
import { imagesRoot } from "../../../utils/constants";

export async function runFacesWorker(): Promise<void> {
  getEntriesDatabase();
  getFacesWorkerDatabase();
  setFacesWorkerStorage(createFacesWorkerStorage());

  initGlobalJobQueue(5, undefined, {
    queuePath: join(imagesRoot, "picisa_queue_faces.db"),
  });

  try {
    await buildFaceScan();
  } finally {
    setFacesWorkerStorage(null);
  }
}
