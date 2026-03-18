/**
 * Run faces worker: build face scan with picisa_faces.db as write target.
 */
import { getEntriesDatabase } from "../../entries/internal/database";
import { getFacesWorkerDatabase } from "./worker-database";
import {
  setFacesWorkerStorage,
  createFacesWorkerStorage,
} from "./face/faces-worker-storage";
import { buildFaceScan } from "./worker-thread";

export async function runFacesWorker(): Promise<void> {
  getEntriesDatabase();
  getFacesWorkerDatabase();
  setFacesWorkerStorage(createFacesWorkerStorage());

  try {
    await buildFaceScan();
  } finally {
    setFacesWorkerStorage(null);
  }
}
