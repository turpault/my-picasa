import * as tf from "@tensorflow/tfjs-node";
import * as faceapi from "@vladmandic/face-api";
import Debug from "debug";
import { mkdir, readFile } from "fs/promises";
import { join } from "path";
import { lock } from "../../../shared/lib/mutex";
import { Queue } from "../../../shared/lib/queue";
import {
  albumEntryFromId,
  idFromAlbumEntry,
  isAnimated,
  isPicture,
  jsonifyObject,
  pathForEntryMetadata,
} from "../../../shared/lib/utils";
import { Album, AlbumEntry } from "../../../shared/types/types";
import { media } from "../../rpc/rpcFunctions/albumUtils";
import { facesFolder } from "../../utils/constants";
import {
  entryFilePath,
  fileExists,
  safeWriteFile,
} from "../../utils/serverUtils";
import { getFolderAlbums, waitUntilWalk } from "../../walker";
import { FaceLandmarkData } from "./types";
import { isUsefulReference } from "./face-utils";
const debug = Debug("app:faces");

let optionsSSDMobileNet: faceapi.SsdMobilenetv1Options;

// Limit the parallelism for the face parsing
const faceProcessingQueue = new Queue(30);

export async function populateReferences() {
  await tf.ready;
  await waitUntilWalk();
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

function referencePath(entry: AlbumEntry) {
  const path = pathForEntryMetadata(entry);
  return {
    path: join(facesFolder, "references", ...path.path),
    file: `${path.filename}.json`,
  };
}

async function entryHasReferences(entry: AlbumEntry) {
  const p = referencePath(entry);
  return fileExists(join(p.path, p.file));
}

const referenceQualifier = "reference";
export type Reference = {
  id: string;
  data: FaceLandmarkData;
};

export async function readReferencesFromReferenceId(
  id: string,
): Promise<Reference | undefined> {
  const { entry, index } = decodeReferenceId(id);
  const references = await readReferencesOfEntry(entry);
  return references?.[parseInt(index)];
}

export async function readReferencesOfEntry(
  entry: AlbumEntry,
): Promise<Reference[] | undefined> {
  try {
    const c = referencePath(entry);
    const path = join(c.path, c.file);
    const buf = await readFile(path, {
      encoding: "utf-8",
    });
    return JSON.parse(buf, (key, value) =>
      key === "descriptor"
        ? new Float32Array(
            value instanceof Array
              ? value
              : Object.entries(value)
                  .filter(([k]) => !isNaN(parseInt(k)))
                  .map(([k, v]) => v),
          )
        : value,
    ) as Reference[];
  } catch (e) {
    return undefined;
  }
}
export function decodeReferenceId(id: string) {
  const [mediaId, index] = id.split(":");
  const entry = albumEntryFromId(mediaId)!;
  if (!entry) throw new Error(`Invalid reference id ${id}`);
  return { entry, index };
}

export async function referencesFromId(id: string) {
  const { entry, index } = decodeReferenceId(id);
  const references = await readReferencesOfEntry(entry!);
  return references?.[parseInt(index)];
}

async function writeReferencesOfEntry(entry: AlbumEntry, data: Reference[]) {
  const p = referencePath(entry);
  await mkdir(p.path, { recursive: true });
  await safeWriteFile(
    join(p.path, p.file),
    JSON.stringify(
      data,
      (key, value) => (key === "descriptor" ? Array.from(value) : value),
      2,
    ),
  );
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
              ) as FaceLandmarkData[]
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
  return [] as FaceLandmarkData[];
}
