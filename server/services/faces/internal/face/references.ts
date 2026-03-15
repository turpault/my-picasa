import * as tf from "@tensorflow/tfjs-node";
import * as faceapi from "@vladmandic/face-api";
import Debug from "debug";
import { readFile } from "fs/promises";
import { join } from "path";
import { lock } from "../../../../../shared/lib/mutex";
import { addJob } from "../../../../utils/global-job-queue";
import {
  Album,
  AlbumEntry,
  Reference,
  ReferenceData,
} from "../../../../../shared/types/types";
import { isUsefulReference } from "../../../../operations/faces/face-utils";
import {
  readReferencesOfEntry,
  referencePath,
  writeReferencesOfEntry,
} from "../../../../rpc/referenceFiles";
import { media } from "../../../../rpc/rpcFunctions/albumUtils";
import { entryFilePath, fileExists } from "../../../../utils/serverUtils";
import { getAllAlbums } from "../../../walker/queries";
import {
  idFromAlbumEntry,
  isAnimated,
  isPicture,
  jsonifyObject,
} from "../../../../../shared/lib/utils";
const debug = Debug("app:faces");

let optionsSSDMobileNet: faceapi.SsdMobilenetv1Options;

let faceApiReadyResolve: () => void;
/** Resolved when setupFaceAPI completes. Event-driven FACE jobs await this before running. */
export const faceApiReadyPromise = new Promise<void>((r) => {
  faceApiReadyResolve = r;
});

export async function setupFaceAPI() {
  await tf.ready;
  optionsSSDMobileNet = new faceapi.SsdMobilenetv1Options({
    minConfidence: 0.5,
    maxResults: 100,
  });
  const modelPath = join(
    require.resolve("@vladmandic/face-api"),
    "..",
    "..",
    "model",
  );
  await faceapi.nets.ssdMobilenetv1.loadFromDisk(modelPath);
  await faceapi.nets.faceLandmark68Net.loadFromDisk(modelPath);
  await faceapi.nets.faceRecognitionNet.loadFromDisk(modelPath);
  await faceapi.nets.ageGenderNet.loadFromDisk(modelPath);
  await faceapi.nets.faceExpressionNet.loadFromDisk(modelPath);
  faceApiReadyResolve();
}

export async function populateAllReferences() {
  const albums = await getAllAlbums();
  const { drainGlobalQueue, getGlobalQueueStats } = await import("../../../../utils/global-job-queue");

  for (const album of albums) {
    const entries = await media(album);
    let needsWork = false;
    for (const entry of entries.entries) {
      if (isPicture(entry) && !isAnimated(entry) && !(await entryHasReferences(entry))) {
        needsWork = true;
        break;
      }
    }
    if (!needsWork) continue;
    addJob(async () => {
      await processFaces(album).catch(debug);
    }, "FACE");
  }
  const t = setInterval(
    () => {
      const stats = getGlobalQueueStats();
      debug(`populateReferences: Remaining ${stats.pending + stats.active} albums to process.`);
    },
    2000,
  );
  await drainGlobalQueue();
  clearInterval(t);
}

/** Check if entry already has face reference file. Used by job schedulers to skip unnecessary jobs. */
export async function entryHasReferences(entry: AlbumEntry): Promise<boolean> {
  const p = referencePath(entry);
  return fileExists(join(p.path, p.file));
}

async function processFaces(album: Album) {
  const entries = await media(album);

  await Promise.all(
    entries.entries.map(async (entry) => {
      if (await entryHasReferences(entry)) {
        return;
      }

      const imagePath = entryFilePath(entry);
      const exists = await fileExists(imagePath);
      if (!exists) {
        return;
      }
      await createReferenceFileIfNeeded(entry);
    }),
  );
}

export const referenceQualifier = "reference";

/** Create face reference file for an entry if needed. Used by event-driven FACE job scheduler. */
export async function createReferenceFileIfNeeded(entry: AlbumEntry) {
  await faceApiReadyPromise;
  const imagePath = entryFilePath(entry);
  const exists = await fileExists(imagePath);
  if (isPicture(entry) && !isAnimated(entry)) {
    if (exists) {
      let detectedReferences = (await readReferencesOfEntry(entry))?.filter(
        (r) => isUsefulReference(r, "child"),
      );
      if (!detectedReferences) {
        debug(`Will generate references of file ${imagePath}`);
        await addJob(async () => {
          const l = await lock(`createReferenceFileIfNeeded:${imagePath}`);
          try {
            const buffer = await readFile(imagePath);
            // Load image
            const tensor = tf.tidy(() =>
              tf.node
                .decodeImage(buffer as unknown as Uint8Array<ArrayBufferLike>, 3, undefined, true)
                .toFloat()
                .expandDims(),
            );
            //const tensor = tf.node.decodeImage(buffer, undefined, undefined, true);
            //const expandT = tf.expandDims(tensor, 0); // add batch dimension to tensor
            const faceReferences = await faceapi
              .detectAllFaces(
                tensor as any, // as any because of some input issues
                optionsSSDMobileNet,
              )
              .withFaceLandmarks()
              .withFaceExpressions()
              .withAgeAndGender()
              .withFaceDescriptors();
            tf.dispose(tensor);

            const detectedReferences = (
              jsonifyObject(
                // Only bigger mugshots !
                faceReferences,
              ) as ReferenceData[]
            )
              .map((data, index) => ({
                data,
                id: `${idFromAlbumEntry(entry, referenceQualifier)}:${index}`,
              }))
              .filter((reference: Reference) =>
                isUsefulReference(reference, "child"),
              );
            writeReferencesOfEntry(entry, detectedReferences);
          } catch (e) {
            debug("Warning:", imagePath, e, entry);
            detectedReferences = [] as Reference[];
            writeReferencesOfEntry(entry, detectedReferences);
          } finally {
            l();
          }
        }, "FACE");
      }
      return detectedReferences;
    }
  }
  return [] as Reference[];
}
