import * as tf from "@tensorflow/tfjs-node";
import * as faceapi from "@vladmandic/face-api";
import Debug from "debug";
import { readFile } from "fs/promises";
import { join } from "path";
import {
  readReferencesOfEntry,
  referencePath,
  writeReferencesOfEntry,
} from "../../../server/rpc/albumTypes/referenceFiles";
import { media } from "../../../server/rpc/rpcFunctions/albumUtils";
import { entryFilePath, fileExists } from "../../../server/utils/serverUtils";
import { getFolderAlbums } from "../../../server/walker";
import { lock } from "../../../shared/lib/mutex";
import { Queue } from "../../../shared/lib/queue";
import {
  idFromAlbumEntry,
  isAnimated,
  isPicture,
  jsonifyObject,
} from "../../../shared/lib/utils";
import {
  Album,
  AlbumEntry,
  Reference,
  ReferenceData,
} from "../../../shared/types/types";
import { isUsefulReference } from "./face-utils";
import { FaceLandmarkData } from "./types";
const debug = Debug("app:faces");

let optionsSSDMobileNet: faceapi.SsdMobilenetv1Options;

// Limit the parallelism for the face parsing
const faceProcessingQueue = new Queue(30);

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
}

export async function populateAllReferences() {
  const albums = await getFolderAlbums();

  const inProgress = new Set<Album>();
  for (const album of albums) {
    faceProcessingQueue.add(async () => {
      inProgress.add(album);
      await processFaces(album).catch(debug);
      inProgress.delete(album);
    });
  }
  const t = setInterval(
    () =>
      debug(
        `populateReferences: Remaining ${faceProcessingQueue.length()} albums to process.`,
      ),
    2000,
  );
  await faceProcessingQueue.drain();
  clearInterval(t);
}

async function entryHasReferences(entry: AlbumEntry) {
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

const referenceGeneratorQueue = new Queue(10);
export const referenceQualifier = "reference";

async function createReferenceFileIfNeeded(entry: AlbumEntry) {
  const imagePath = entryFilePath(entry);
  const exists = await fileExists(imagePath);
  if (isPicture(entry) && !isAnimated(entry)) {
    if (exists) {
      let detectedReferences = (await readReferencesOfEntry(entry))?.filter(
        (r) => isUsefulReference(r, "child"),
      );
      if (!detectedReferences) {
        debug(`Will generate references of file ${imagePath}`);
        await referenceGeneratorQueue.add(async () => {
          const l = await lock(`createReferenceFileIfNeeded:${imagePath}`);
          try {
            const buffer = await readFile(imagePath);
            // Load image
            const tensor = tf.tidy(() =>
              tf.node
                .decodeImage(buffer, 3, undefined, true)
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
        });
      }
      return detectedReferences;
    }
  }
  return [] as Reference[];
}
