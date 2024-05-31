import * as tf from "@tensorflow/tfjs-node";
import * as faceapi from "@vladmandic/face-api";
import Debug from "debug";
import { mkdir, readFile } from "fs/promises";
import { join } from "path";
import { lock } from "../../../shared/lib/mutex";
import { Queue } from "../../../shared/lib/queue";
import {
  albumEntryFromId,
  debounce,
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
const debug = Debug("app:faces");

export type FaceLandmarkData = { hash?: string } & faceapi.WithAge<
  faceapi.WithGender<
    faceapi.WithFaceExpressions<
      faceapi.WithFaceDescriptor<
        faceapi.WithFaceLandmarks<
          {
            detection: faceapi.FaceDetection;
          },
          faceapi.FaceLandmarks68
        >
      >
    >
  >
>;
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
  return fileExists(referencePath(entry).path);
}

const referenceQualifier = "reference";
export async function readReferencesOfEntry(entry: AlbumEntry) {
  try {
    const c = referencePath(entry);
    const path = join(c.path, c.file);
    const buf = await readFile(path, {
      encoding: "utf-8",
    });
    return (JSON.parse(buf) as FaceLandmarkData[]).map((data, index) => ({
      id: `${idFromAlbumEntry(entry, referenceQualifier)}:${index}`,
      data,
    }));
  } catch (e) {
    return undefined;
  }
}
export async function referencesFromId(id: string) {
  const [mediaId, index] = id.split(":");
  const media = albumEntryFromId(mediaId);
  const references = await readReferencesOfEntry(media!);
  return references?.[parseInt(index)];
}

async function writeReferencesOfEntry(
  entry: AlbumEntry,
  data: FaceLandmarkData[],
) {
  const p = referencePath(entry);
  return debounce(
    async () => {
      await mkdir(p.path, { recursive: true });
      await safeWriteFile(join(p.path, p.file), JSON.stringify(data));
    },
    20000,
    p.file,
    false,
  );
}

async function processFaces(album: Album) {
  const entries = await media(album);
  for (const entry of entries.entries) {
    if (await entryHasReferences(entry)) {
      continue;
    }

    const imagePath = entryFilePath(entry);
    const exists = await fileExists(imagePath);
    if (!exists) {
      continue;
    }
    const detectedReferences = await getOrCreateReferenceFile(entry);
    if (!detectedReferences) {
      continue;
    }
    await writeReferencesOfEntry(entry, detectedReferences);
  }
}

async function getOrCreateReferenceFile(entry: AlbumEntry) {
  const imagePath = entryFilePath(entry);
  const exists = await fileExists(imagePath);
  if (isPicture(entry) && !isAnimated(entry)) {
    if (exists) {
      let detectedReferences = (await readReferencesOfEntry(entry))?.map(
        (r) => r.data,
      );
      if (!detectedReferences) {
        debug(`Will generate references of file ${imagePath}`);
        const l = await lock(`getOrCreateReferenceFile:${imagePath}`);
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

          const detectedReferences = jsonifyObject(
            faceReferences,
          ) as FaceLandmarkData[];
          writeReferencesOfEntry(entry, detectedReferences);
        } catch (e) {
          debug("Warning:", imagePath, e, entry);
          detectedReferences = [] as FaceLandmarkData[];
          writeReferencesOfEntry(entry, detectedReferences);
        } finally {
          l();
        }
      }
      return detectedReferences;
    }
  }
  return [] as FaceLandmarkData[];
}
