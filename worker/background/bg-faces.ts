import * as tf from "@tensorflow/tfjs-node";
import Debug from "debug";
import { Queue } from "../../shared/lib/queue";
import { getFaceAlbums } from "../../server/rpc/rpcFunctions/faces";
import { media } from "../../server/rpc/rpcFunctions/albumUtils";
import { getFaceImage } from "../../server/rpc/rpcFunctions/thumbnail";
import { waitUntilWalk } from "../../server/walker";
import { runClusterStrategy } from "./face/identify-cluster-strategy";
import { runFaceMatcherStrategy } from "./face/identify-facematcher-strategy";
import { startRedis, stopRedis } from "./redis-process";
import { buildContactList } from "../../server/rpc/albumTypes/contacts";
import { populateReferences } from "./face/references";
const debug = Debug("app:faces");

export async function buildFaceScan() {
  await Promise.all([startRedis(), tf.ready, waitUntilWalk()]);

  debug("Building face scan");
  debug("Building identified contact list");
  await buildContactList();
  debug("Build references");
  await populateReferences();

  debug("Running cluster strategy");
  await runClusterStrategy();
  debug("Running face matcher strategy");
  await runFaceMatcherStrategy();

  debug("Exporting all faces");
  await exportAllFaces();
  debug("Stopping redis");
  await stopRedis();
  debug("Face scan complete");
}

/**
 * Export all faces to a folder
 */
async function exportAllFaces() {
  const getFaceImageQueue = new Queue(4, { fifo: false });

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
          getFaceImageQueue.add(() => getFaceImage(entry, true)),
        ),
      );
    }),
  );
  await getFaceImageQueue.drain();
  clearInterval(interval);
}
