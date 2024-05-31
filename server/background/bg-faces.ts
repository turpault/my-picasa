import * as tf from "@tensorflow/tfjs-node";
import Debug from "debug";
import { Queue } from "../../shared/lib/queue";
import { faceAlbumsReady, getFaceAlbums } from "../rpc/albumTypes/faces";
import { media } from "../rpc/rpcFunctions/albumUtils";
import { getFaceImage } from "../rpc/rpcFunctions/thumbnail";
import { waitUntilWalk } from "../walker";
import { populateCandidates, populateDatabase } from "./face/feature-db";
import { populateReferences } from "./face/references";
import { startRedis, stopRedis } from "./redis-process";
const debug = Debug("app:faces");

// Strategy
// 1. Enumerate all the pictures, and proceed with the face detection
//    - This creates a json file, which is an array of FaceLandmarkData
//    - This file is stored in the faces folder, in a subfolder called "references"
// 2. For each face detected, cluster by creating a sortable hash based on its descriptors
//    - Like a geo hash, all the descriptors are interleaved into a single sortable string
//    - This hash is then used to as a key to group near descriptors in clusters.
//    - The .ini files are read, to extract the existing user-identified faces + the contact name
// 3. "Candidate" matches are found by comparing the descriptors of the detected faces with the existing user-identified faces

export async function buildFaceScan() {
  await Promise.all([
    startRedis(),
    faceAlbumsReady(),
    tf.ready,
    waitUntilWalk(),
  ]);

  await populateReferences();
  await populateDatabase();
  await populateCandidates();

  await exportAllFaces();
  await stopRedis();
}

/**
 * Export all faces to a folder
 */
async function exportAllFaces() {
  const getFaceImageQueue = new Queue(4, { fifo: false });
  const albums = await getFaceAlbums();
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
}
