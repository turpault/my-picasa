import * as tf from "@tensorflow/tfjs-node";
import * as faceapi from "@vladmandic/face-api";
import Debug from "debug";
import { readFile } from "fs/promises";
import { join } from "path";
import { lock } from "../../../../../shared/lib/mutex";
import { addFacesJob } from "../../../../utils/faces-job-queue";
import { AlbumEntry, Reference, ReferenceData } from "../../../../../shared/types/types";
import { isUsefulReference } from "../../../../operations/faces/face-utils";
import {
  readReferencesOfEntry,
  referencePath,
  writeReferencesOfEntry,
} from "../../../../rpc/referenceFiles";
import { entryFilePath, fileExists } from "../../../../utils/serverUtils";
import { getEntriesDatabase } from "../../../entries/internal/database";
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

export type PopulateReferencesOptions = {
  isExpired: () => boolean;
  batchSize: number;
  parallelism: number;
};

/**
 * Build face reference files for static images that lack them.
 * Sources candidates from picisa_entries.db in stable pages; processes up to `parallelism`
 * entries at a time (each may enqueue a FACE job on the in-process global queue).
 */
export async function populateAllReferences(options: PopulateReferencesOptions): Promise<void> {
  const db = getEntriesDatabase();
  const { isExpired, batchSize, parallelism } = options;
  let offset = 0;
  let totalScanned = 0;
  let batchRound = 0;

  while (!isExpired()) {
    const batch = await db.listStaticPictureEntriesBatch(batchSize, offset);
    if (batch.length === 0) break;
    offset += batch.length;
    totalScanned += batch.length;
    batchRound++;

    const candidates: AlbumEntry[] = [];
    for (const entry of batch) {
      if (!isPicture(entry) || isAnimated(entry)) continue;
      if (await entryHasReferences(entry)) continue;
      const imagePath = entryFilePath(entry);
      if (!(await fileExists(imagePath))) continue;
      candidates.push(entry);
    }

    for (let i = 0; i < candidates.length && !isExpired(); i += parallelism) {
      const slice = candidates.slice(i, i + parallelism);
      await Promise.all(
        slice.map((entry) =>
          createReferenceFileIfNeeded(entry).catch((err) => {
            debug("createReferenceFileIfNeeded:", entryFilePath(entry), err);
          }),
        ),
      );
    }

    if (batchRound % 10 === 0) {
      debug(
        `populateReferences: scanned ${totalScanned} static-image rows from entries DB (offset ${offset})`,
      );
    }
  }

  if (isExpired()) {
    debug("populateReferences: stopped early (time budget)");
  }
}

/** Check if entry already has face reference file. Used by job schedulers to skip unnecessary jobs. */
export async function entryHasReferences(entry: AlbumEntry): Promise<boolean> {
  const p = referencePath(entry);
  return fileExists(join(p.path, p.file));
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
        await addFacesJob(async () => {
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
