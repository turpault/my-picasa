import * as tf from "@tensorflow/tfjs-node";
import Debug from "debug";
import { Queue } from "../../../../shared/lib/queue";
import { getFaceImage } from "../../../rpc/rpcFunctions/thumbnail";
import { getEntriesForContact, getContacts } from "../queries";
import { runClusterStrategy } from "./face/identify-cluster-strategy";
import { populateAllReferences, setupFaceAPI } from "./face/references";
const debug = Debug("app:faces");

export async function buildFaceScan() {
  await tf.ready;

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

  const contacts = await getContacts();
  const interval = setInterval(() => {
    debug(
      `Exporting faces. Remaining ${getFaceImageQueue.done()}/${getFaceImageQueue.total()} (${Math.floor((100 * getFaceImageQueue.done()) / getFaceImageQueue.total())}%)`,
    );
  }, 2000);
  await Promise.all(
    contacts.map(async (contact) => {
      const entries = await getEntriesForContact(contact);
      await Promise.all(
        entries.map(async (entry) =>
          getFaceImageQueue.add(() => getFaceImage(entry.name, true)),
        ),
      );
    }),
  );
  await getFaceImageQueue.drain();
  clearInterval(interval);
}

