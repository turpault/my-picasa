import * as tf from "@tensorflow/tfjs-node";
import * as faceapi from "@vladmandic/face-api";
import Debug from "debug";
import { readFile } from "fs/promises";
import { join } from "path";
import { lock } from "../../../../../shared/lib/mutex";
import { AlbumEntry, Reference, ReferenceData } from "../../../../../shared/types/types";
import { isUsefulReference } from "../../../../operations/faces/face-utils";
import {
  readReferencesOfEntry,
  referencePath,
  writeReferencesOfEntry,
} from "../../../../rpc/referenceFiles";
import { entryFilePath, fileExists } from "../../../../utils/serverUtils";
import {
  ensureFaceReferenceScanSchema,
  listPictureEntriesNeedingReferenceScan,
  markFaceReferenceScanDone,
  pruneFacesDataForRemovedEntries,
} from "../face-reference-scan";
import { getFacesWorkerDatabase } from "../worker-database";
import {
  idFromAlbumEntry,
  isAnimated,
  isPicture,
  jsonifyObject,
} from "../../../../../shared/lib/utils";
const debug = Debug("app:faces");

let optionsSSDMobileNet: faceapi.SsdMobilenetv1Options;

let faceApiReadyResolve: () => void;
/** Resolved when setupFaceAPI completes; reference detection awaits this before running. */
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
 * Compares picisa_entries (attached) with face_reference_scan in picisa_faces.db:
 * one page of not-yet-scanned rows per iteration, then prune face_rects / scan rows for
 * entries removed from the library.
 */
export async function populateAllReferences(options: PopulateReferencesOptions): Promise<void> {
  const { isExpired, batchSize, parallelism } = options;
  const facesDb = getFacesWorkerDatabase();
  ensureFaceReferenceScanSchema(facesDb);
  let page = 0;

  while (!isExpired()) {
    const rows = listPictureEntriesNeedingReferenceScan(facesDb, batchSize);
    if (rows.length === 0) break;
    page++;

    type Work = { entry: AlbumEntry; entryId: string };
    const toProcess: Work[] = [];
    for (const row of rows) {
      const entry: AlbumEntry = {
        album: { key: row.album_key, name: row.album_name },
        name: row.entry_name,
      };
      if (!isPicture(entry) || isAnimated(entry)) {
        await markFaceReferenceScanDone(facesDb, row.entry_id);
        continue;
      }
      if (await entryHasReferences(entry)) {
        await markFaceReferenceScanDone(facesDb, row.entry_id);
        continue;
      }
      const imagePath = entryFilePath(entry);
      if (!(await fileExists(imagePath))) {
        await markFaceReferenceScanDone(facesDb, row.entry_id);
        continue;
      }
      toProcess.push({ entry, entryId: row.entry_id });
    }

    for (let i = 0; i < toProcess.length && !isExpired(); i += parallelism) {
      const slice = toProcess.slice(i, i + parallelism);
      await Promise.all(
        slice.map(async ({ entry, entryId }) => {
          try {
            await runFaceReferenceDetectionForEntry(entry);
          } catch (err) {
            debug("runFaceReferenceDetectionForEntry:", entryFilePath(entry), err);
          } finally {
            await markFaceReferenceScanDone(facesDb, entryId);
          }
        }),
      );
    }

    if (page % 10 === 0) {
      debug(`populateReferences: ${page} page(s) of entries not yet in face_reference_scan`);
    }
  }

  await pruneFacesDataForRemovedEntries(facesDb);

  if (isExpired()) {
    debug("populateReferences: stopped early (time budget)");
  }
}

/** Check if entry already has face reference file. */
export async function entryHasReferences(entry: AlbumEntry): Promise<boolean> {
  const p = referencePath(entry);
  return fileExists(join(p.path, p.file));
}

export const referenceQualifier = "reference";

async function runFaceReferenceDetectionForEntry(entry: AlbumEntry): Promise<void> {
  await faceApiReadyPromise;
  const imagePath = entryFilePath(entry);
  const l = await lock(`createReferenceFileIfNeeded:${imagePath}`);
  try {
    const buffer = await readFile(imagePath);
    const tensor = tf.tidy(() =>
      tf.node
        .decodeImage(buffer as unknown as Uint8Array<ArrayBufferLike>, 3, undefined, true)
        .toFloat()
        .expandDims(),
    );
    const faceReferences = await faceapi
      .detectAllFaces(tensor as any, optionsSSDMobileNet)
      .withFaceLandmarks()
      .withFaceExpressions()
      .withAgeAndGender()
      .withFaceDescriptors();
    tf.dispose(tensor);

    const detectedReferences = (
      jsonifyObject(faceReferences) as ReferenceData[]
    )
      .map((data, index) => ({
        data,
        id: `${idFromAlbumEntry(entry, referenceQualifier)}:${index}`,
      }))
      .filter((reference: Reference) => isUsefulReference(reference, "child"));
    writeReferencesOfEntry(entry, detectedReferences);
  } catch (e) {
    debug("Warning:", imagePath, e, entry);
    writeReferencesOfEntry(entry, [] as Reference[]);
  } finally {
    l();
  }
}

/** Create face reference file for an entry if needed (runs detection inline when missing). */
export async function createReferenceFileIfNeeded(entry: AlbumEntry): Promise<Reference[]> {
  await faceApiReadyPromise;
  const imagePath = entryFilePath(entry);
  const exists = await fileExists(imagePath);
  if (isPicture(entry) && !isAnimated(entry) && exists) {
    let detectedReferences = (await readReferencesOfEntry(entry))?.filter((r) =>
      isUsefulReference(r, "child"),
    );
    if (!detectedReferences) {
      debug(`Will generate references of file ${imagePath}`);
      await runFaceReferenceDetectionForEntry(entry);
      detectedReferences =
        (await readReferencesOfEntry(entry))?.filter((r) => isUsefulReference(r, "child")) ?? [];
    }
    return detectedReferences ?? [];
  }
  return [];
}
