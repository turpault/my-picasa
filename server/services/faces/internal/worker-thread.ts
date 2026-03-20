import * as tf from "@tensorflow/tfjs-node";
import Debug from "debug";
import { Queue } from "../../../../shared/lib/queue";
import { getFaceImage } from "../../../rpc/rpcFunctions/thumbnail";
import { getEntriesForContact, getContacts } from "../queries";
import { runClusterStrategy } from "./face/identify-cluster-strategy";
import { populateAllReferences, setupFaceAPI } from "./face/references";
const debug = Debug("app:faces");

export type BuildFaceScanOptions = {
  isExpired: () => boolean;
  facesBatchSize: number;
  facesParallelism: number;
};

export async function buildFaceScan(options: BuildFaceScanOptions) {
  const { isExpired, facesBatchSize, facesParallelism } = options;

  await tf.ready;

  // Access database to ensure it's initialized (lazy initialization via queries)
  await getContacts();

  debug("Build references");
  await setupFaceAPI();
  if (isExpired()) {
    debug("Face scan: time budget exhausted after setupFaceAPI");
    return;
  }
  await populateAllReferences({
    isExpired,
    batchSize: facesBatchSize,
    parallelism: facesParallelism,
  });

  if (isExpired()) {
    debug("Face scan: time budget exhausted after reference population");
    return;
  }

  debug("Running cluster strategy");
  await runClusterStrategy();
  debug("Running face matcher strategy");
  // await runFaceMatcherStrategy();

  if (isExpired()) {
    debug("Face scan: time budget exhausted after cluster strategy");
    return;
  }

  debug("Exporting all faces");
  await exportAllFaces(isExpired);
  debug("Face scan complete");
}

/**
 * Export all faces to a folder
 */
async function exportAllFaces(isExpired: () => boolean) {
  const getFaceImageQueue = new Queue(10, { fifo: false });

  const contacts = await getContacts();
  const interval = setInterval(() => {
    debug(
      `Exporting faces. Remaining ${getFaceImageQueue.done()}/${getFaceImageQueue.total()} (${Math.floor((100 * getFaceImageQueue.done()) / getFaceImageQueue.total())}%)`,
    );
  }, 2000);
  for (const contact of contacts) {
    if (isExpired()) break;
    const entries = await getEntriesForContact(contact);
    await Promise.all(
      entries.map(async (entry) =>
        getFaceImageQueue.add(() => getFaceImage(entry.name, true)),
      ),
    );
  }
  await getFaceImageQueue.drain();
  clearInterval(interval);
}

