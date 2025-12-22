import * as tf from "@tensorflow/tfjs-node";
import Debug from "debug";
import { parentPort, workerData } from "worker_threads";
import { Queue } from "../../../shared/lib/queue";
import { getFaceAlbums } from "../../rpc/rpcFunctions/faces";
import { media } from "../../rpc/rpcFunctions/albumUtils";
import { getFaceImage } from "../../rpc/rpcFunctions/thumbnail";
import { runClusterStrategy } from "./face/identify-cluster-strategy";
// import { runFaceMatcherStrategy } from "./face/identify-facematcher-strategy";
// import { startRedis, stopRedis } from "./redis-process";
import { buildContactList } from "../../rpc/albumTypes/contacts";
import { populateAllReferences, setupFaceAPI } from "./face/references";
const debug = Debug("app:faces");

export async function buildFaceScan() {
  await tf.ready;

  debug("Building face scan");
  debug("Building identified contact list");
  await buildContactList();
  debug("Build references");
  await setupFaceAPI();
  await populateAllReferences();

  debug("Running cluster strategy");
  await runClusterStrategy();
  debug("Running face matcher strategy");
  // await runFaceMatcherStrategy();

  debug("Exporting all faces");
  await exportAllFaces();
  debug("Face scan complete");
}

/**
 * Export all faces to a folder
 */
async function exportAllFaces() {
  const getFaceImageQueue = new Queue(10, { fifo: false });

  const albums = await getFaceAlbums();
  const interval = setInterval(() => {
    debug(
      `Exporting faces. Remaining ${getFaceImageQueue.done()}/${getFaceImageQueue.total()} (${Math.floor((100 * getFaceImageQueue.done()) / getFaceImageQueue.total())}%)`,
    );
  }, 2000);
  await Promise.all(
    albums.map(async (album) => {
      const entries = await media(album);
      await Promise.all(
        entries.entries.map(async (entry) =>
          getFaceImageQueue.add(() => getFaceImage(entry.name, true)),
        ),
      );
    }),
  );
  await getFaceImageQueue.drain();
  clearInterval(interval);
}

/**
 * Start the faces worker
 */
export async function startWorker(): Promise<void> {
  await buildFaceScan();
}

// Initialize worker if running in a worker thread
if (parentPort && workerData?.serviceName === 'faces') {
  const serviceName = workerData.serviceName;
  console.info(`Worker thread started for service: ${serviceName}`);
  startWorker().catch((error) => {
    console.error(`Error starting worker ${serviceName}:`, error);
    process.exit(1);
  });
}
