import * as tf from "@tensorflow/tfjs-node";
import * as faceapi from "@vladmandic/face-api";
import { mkdir, readFile } from "fs/promises";
import { join } from "path";
import {
  FaceList,
  debounce,
  decodeFaces,
  decodeRect,
  encodeFaces,
  encodeRect,
  isAnimated,
  isPicture,
  jsonifyObject,
  pathForEntryMetadata,
  sleep,
  toBase64,
  uuid,
} from "../../shared/lib/utils";
import {
  Album,
  AlbumEntry,
  AlbumKind,
  Contact,
  keyFromID,
} from "../../shared/types/types";
import {
  FaceAlbumWithData,
  addFaceAlbumByHash,
  faceAlbumsReady,
  getAllContacts,
  getFaceAlbumFromHash,
  getFaceAlbums,
  getFaceAlbumsByName,
  normalizeName,
  readContacts,
  updateFaceAlbumsByName,
} from "../rpc/albumTypes/faces";
import {
  getPicasaEntry,
  readAlbumIni,
  updatePicasa,
  updatePicasaEntry,
} from "../rpc/rpcFunctions/picasa-ini";
import { Features, facesFolder } from "../utils/constants";
import { entryFilePath, fileExists, safeWriteFile } from "../utils/serverUtils";
import { getFolderAlbums, waitUntilWalk } from "../walker";
import { Queue } from "../../shared/lib/queue";
import { media } from "../rpc/rpcFunctions/albumUtils";
import { lock } from "../../shared/lib/mutex";
import { getFaceImage } from "../rpc/rpcFunctions/thumbnail";

type FaceLandmarkData = { hash?: string } & faceapi.WithAge<
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
const hashToReferenceFeature: { [hash: string]: FaceLandmarkData } = {};

async function readReferenceFeatures() {
  try {
    const buf = await readFile(join(facesFolder, "referenceFeatures.json"), {
      encoding: "utf-8",
    });
    const d = JSON.parse(buf);
    Object.assign(hashToReferenceFeature, d);
  } catch (e) {
    // Do nothing
  }
}

async function writeReferenceFeatures() {
  return debounce(
    async () => {
      await safeWriteFile(
        join(facesFolder, "referenceFeatures.json"),
        JSON.stringify(hashToReferenceFeature)
      );
    },
    20000,
    "writeReferenceFeatures",
    false
  );
}
// Limit the parallelism for the face parsing
const faceProcessingQueue = new Queue(30);

let parsedFaces = new Set<string>();

export async function buildFaceScan(repeat: boolean) {
  await faceAlbumsReady();
  await tf.ready;
  await waitUntilWalk();
  await readReferenceFeatures();
  if (!Features.faces) {
    return;
  }
  optionsSSDMobileNet = new faceapi.SsdMobilenetv1Options({
    minConfidence: 0.5,
    maxResults: 100,
  });
  const modelPath = join(
    require.resolve("@vladmandic/face-api"),
    "..",
    "..",
    "model"
  );
  await faceapi.nets.ssdMobilenetv1.loadFromDisk(modelPath);
  await faceapi.nets.faceLandmark68Net.loadFromDisk(modelPath);
  await faceapi.nets.faceRecognitionNet.loadFromDisk(modelPath);
  await faceapi.nets.ageGenderNet.loadFromDisk(modelPath);
  await faceapi.nets.faceExpressionNet.loadFromDisk(modelPath);

  while (true) {
    const albums = await getFolderAlbums();

    const inProgress = new Set<Album>();
    for (const album of albums) {
      faceProcessingQueue.add(async () => {
        inProgress.add(album);
        //await processFaces(album).catch(console.error);
        inProgress.delete(album);
      });
    }
    const t = setInterval(
      () =>
        console.info(
          `Processing faces. Remaining ${faceProcessingQueue.length()} albums to process.`
        ),
      2000
    );
    await faceProcessingQueue.drain();
    clearInterval(t);
    await joinUnmatchedFeatures();
    await exportAllFaces();

    if (!repeat) break;
    await sleep(24 * 60 * 60);
  }
}

let matcher: faceapi.FaceMatcher | undefined;

function referenceFeaturesPath(entry: AlbumEntry) {
  const path = pathForEntryMetadata(entry);
  return {
    path: join(facesFolder, "references", ...path.path),
    file: `${path.filename}.json`,
  };
}

async function readFeaturesOfEntry(entry: AlbumEntry) {
  try {
    const c = referenceFeaturesPath(entry);
    const path = join(c.path, c.file);
    const buf = await readFile(path, {
      encoding: "utf-8",
    });
    return JSON.parse(buf) as FaceLandmarkData[];
  } catch (e) {
    return undefined;
  }
}
async function writeFeaturesOfEntry(
  entry: AlbumEntry,
  data: FaceLandmarkData[]
) {
  const p = referenceFeaturesPath(entry);
  return debounce(
    async () => {
      await mkdir(p.path, { recursive: true });
      await safeWriteFile(join(p.path, p.file), JSON.stringify(data));
    },
    20000,
    p.file,
    false
  );
}

function setFaceHash(
  entry: AlbumEntry,
  hash: string,
  feature: FaceLandmarkData
) {
  feature.hash = hash;
  const left = feature.alignedRect.box.left / feature.detection.imageWidth;
  const right = feature.alignedRect.box.right / feature.detection.imageWidth;
  const top = feature.alignedRect.box.top / feature.detection.imageHeight;
  const bottom = feature.alignedRect.box.bottom / feature.detection.imageHeight;

  const rect = encodeRect({ top, left, right, bottom });
  const contact = createdContacts[hash];
  addContact(entry.album, hash, contact);
  addFaceRectToEntry(entry, rect, hash);
  // TODO Generate thumbnail
  return hash;
}

async function joinUnmatchedFeatures() {
  const albums = await getFolderAlbums();
  for (const album of albums) {
    const entries = await media(album);
    let references: faceapi.LabeledFaceDescriptors[] = [];

    for (const entry of entries.entries) {
      const features = await readFeaturesOfEntry(entry);
      if (!features) continue;
      for (const feature of features) {
        if (!feature.hash) {
          if (matcher === undefined) {
            if (references.length === 0) {
              const newHash = addNewFaceHash(entry, feature);
              writeFeaturesOfEntry(entry, features);

              references.push(
                new faceapi.LabeledFaceDescriptors(newHash, [
                  Float32Array.from(feature.descriptor),
                ])
              );
            }
            matcher = new faceapi.FaceMatcher(references, 0.8);
            continue;
          }

          const bestMatch = matcher!.findBestMatch(feature.descriptor);
          if (bestMatch && bestMatch.distance < 0.1) {
            setFaceHash(entry, bestMatch.label, feature);
            console.info(
              `Found a similar person in other hash (was hash ${bestMatch.label})`
            );
          } else {
            const newHash = addNewFaceHash(entry, feature);
            writeFeaturesOfEntry(entry, features);
            references.push(
              new faceapi.LabeledFaceDescriptors(newHash, [
                Float32Array.from(feature.descriptor),
              ])
            );
            matcher = undefined;
          }
        }
      }
    }
  }
}

async function addFaceRectToEntry(
  entry: AlbumEntry,
  rect: string,
  hash: string
) {
  const current = await getPicasaEntry(entry);
  const iniFaces = current.faces || "";
  const faces = decodeFaces(iniFaces);
  faces.push({
    hash,
    rect,
  });
  const album = getFaceAlbumFromHash(hash);
  const allContacts = getAllContacts();
  const contact = allContacts[album.key];
  addContact(entry.album, hash, contact);
  return updatePicasaEntry(entry, "faces", encodeFaces(faces));
}
async function getClosestHashedFeature(feature: FaceLandmarkData) {
  let match: faceapi.FaceMatch | undefined;
  if (matcher === undefined) {
    const references = Object.entries(hashToReferenceFeature).map(
      ([hash, desc]) =>
        new faceapi.LabeledFaceDescriptors(hash, [
          Float32Array.from(desc.descriptor),
        ])
    );
    if (references.length > 0)
      matcher = new faceapi.FaceMatcher(references, 0.8);
  }
  if (matcher) {
    matcher.labeledDescriptors;
    match = matcher.findBestMatch(feature.descriptor);
  }
  if (match && match.distance < 0.2) {
    // Good one !
    const hash = (feature.hash = match.label);
    console.info(
      `Face feature matching with derived hash ${hash} [${
        getFaceAlbumFromHash(hash)?.name
      } with feature age ${feature.age} / ${feature.gender}]`
    );
    return hash;
  }
  return undefined;
}

async function getOrCreateFeatureFile(entry: AlbumEntry) {
  const imagePath = entryFilePath(entry);
  const exists = await fileExists(imagePath);
  if (isPicture(entry) && !isAnimated(entry)) {
    if (exists) {
      let detectedFeatures = await readFeaturesOfEntry(entry);
      if (!detectedFeatures) {
        console.info(`Will generate features of file ${imagePath}`);
        const l = await lock(imagePath);
        try {
          const buffer = await readFile(imagePath);
          // Load image
          const tensor = tf.tidy(() =>
            tf.node
              .decodeImage(buffer, 3, undefined, true)
              .toFloat()
              .expandDims()
          );
          //const tensor = tf.node.decodeImage(buffer, undefined, undefined, true);
          //const expandT = tf.expandDims(tensor, 0); // add batch dimension to tensor
          const faceFeatures = await faceapi
            .detectAllFaces(
              tensor as any, // as any because of some input issues
              optionsSSDMobileNet
            )
            .withFaceLandmarks()
            .withFaceExpressions()
            .withAgeAndGender()
            .withFaceDescriptors();
          tf.dispose(tensor);

          detectedFeatures = jsonifyObject(faceFeatures) as FaceLandmarkData[];
          writeFeaturesOfEntry(entry, detectedFeatures);
        } catch (e) {
          console.warn(imagePath, e, entry);
          detectedFeatures = [];
          writeFeaturesOfEntry(entry, detectedFeatures);
        } finally {
          l();
        }
      }
      return detectedFeatures;
    }
  }
  return undefined;
}
async function processFaces(album: Album) {
  const allContacts = getAllContacts();
  if (album.key.normalize() !== album.key) {
    debugger;
  }
  const picasaIni = await readAlbumIni(album);
  if (parsedFaces.has(album.key)) {
    return;
  }
  const contacts = readContacts(picasaIni);
  parsedFaces.add(album.key);
  const entries = await media(album);
  for (const entry of entries.entries) {
    // Only process faces when no user is connected
    const imagePath = entryFilePath(entry);
    const exists = await fileExists(imagePath);
    let facesInEntry: FaceList = [];
    const iniFaces = picasaIni[entry.name].faces;
    if (iniFaces) {
      // Example:faces=rect64(9bff22f6ad443ebb),d04ca592f8868c2;rect64(570c6e79670c8820),4f3f1b40e69b2537;rect64(b8512924c7ae41f2),69618ff17d8c570f
      facesInEntry = decodeFaces(iniFaces);
    }
    for (const face of facesInEntry) {
      if (!contacts[face.hash]) {
        const contact = allContacts[getFaceAlbumFromHash(face.hash)?.name];
        if (contact) addContact(album, face.hash, contact);
      }
    }
    const detectedFeatures = await getOrCreateFeatureFile(entry);
    const notHashed = detectedFeatures
      ? detectedFeatures.filter((f) => !f.hash)
      : [];

    // Go through each detected features, try to find features with no associated hashes
    if (notHashed.length === 0) continue;

    const { width, height } = notHashed[0].detection.imageDims;

    // Map them on identified areas
    for (const feature of notHashed) {
      const [x, y] = [
        feature.alignedRect.box.x + feature.alignedRect.box.width / 2,
        feature.alignedRect.box.y + feature.alignedRect.box.height / 2,
      ];
      for (const [index, f] of facesInEntry.entries()) {
        const facePos = decodeRect(f.rect);
        if (
          width * facePos.left < x &&
          width * facePos.right > x &&
          height * facePos.top < y &&
          height * facePos.bottom > y
        ) {
          // This is a match
          console.info(
            `Face feature matching with hash ${f.hash} [${
              getFaceAlbumFromHash(f.hash)?.name
            } with feature age ${feature.age} / ${feature.gender}]`
          );
          feature.hash = f.hash;
          // Update the detected features file, as it has been modified
          writeFeaturesOfEntry(entry, detectedFeatures!);
          if (!hashToReferenceFeature[f.hash]) {
            hashToReferenceFeature[f.hash] = feature;
            matcher = undefined;
            writeReferenceFeatures();
          }
          break;
        }
      }
      // Not found in the rects, get the closest
      const hash = await getClosestHashedFeature(feature);
      if (hash) {
        feature.hash = hash;
        writeFeaturesOfEntry(entry, detectedFeatures!);
        const ref = hashToReferenceFeature[hash]!;
        const rect = encodeRect({
          left: ref.alignedRect.box.left / width,
          right: ref.alignedRect.box.right / width,
          top: ref.alignedRect.box.top / height,
          bottom: ref.alignedRect.box.bottom / height,
        });
        addFaceRectToEntry(entry, rect, hash);
      } else {
        //addUnmatchedFeature(entry, feature);
      }

      // Update the "person albums" to contain references to hash and rects
      // Example:faces=rect64(9bff22f6ad443ebb),d04ca592f8868c2;rect64(570c6e79670c8820),4f3f1b40e69b2537;rect64(b8512924c7ae41f2),69618ff17d8c570f
      for (const face of facesInEntry) {
        const faceAlbum = getFaceAlbumFromHash(face.hash);
        if (faceAlbum) {
          faceAlbum.count++;
          if (album.key.normalize() !== album.key) {
            debugger;
          }
          const sectionName = toBase64(
            JSON.stringify([album.key, entry.name, face])
          );

          if (exists) {
            updatePicasa(
              faceAlbum,
              "originalAlbumName",
              album.name,
              sectionName
            );
            updatePicasa(faceAlbum, "originalAlbumKey", album.key, sectionName);
            updatePicasa(faceAlbum, "originalName", entry.name, sectionName);
          } else {
            updatePicasa(faceAlbum, "originalAlbumName", null, sectionName);
            updatePicasa(faceAlbum, "originalAlbumKey", null, sectionName);
            updatePicasa(faceAlbum, "originalName", null, sectionName);
          }
        }
      }
    }
  }
}
function addNewFaceHash(entry: AlbumEntry, feature: FaceLandmarkData) {
  const hash = `facehash:${uuid()}`;
  feature.hash = hash;
  const left = feature.alignedRect.box.left / feature.detection.imageWidth;
  const right = feature.alignedRect.box.right / feature.detection.imageWidth;
  const top = feature.alignedRect.box.top / feature.detection.imageHeight;
  const bottom = feature.alignedRect.box.bottom / feature.detection.imageHeight;

  const rect = encodeRect({ top, left, right, bottom });
  console.info(
    `Creating new hash in entry ${entry.album.name}/${entry.name} : ${hash} (rect is ${rect})`
  );
  const originalName = "Unknown person added on " + new Date().toISOString();
  const name = normalizeName(originalName);
  const key = keyFromID(name, AlbumKind.FACE);
  const contact: Contact = {
    originalName,
    email: "",
    something: "",
    key,
  };
  addContact(entry.album, hash, contact);
  const faceAlbum: FaceAlbumWithData = {
    count: 0,
    name: contact.originalName,
    key: contact.key,
    hash: [],
    kind: AlbumKind.FACE,
  };
  updateFaceAlbumsByName(contact.key, faceAlbum);

  addFaceAlbumByHash(hash, faceAlbum);

  createdContacts[hash] = contact;
  addFaceRectToEntry(entry, rect, hash);
  // TODO Generate thumbnail
  return hash;
}

const createdContacts: { [hash: string]: Contact } = {};

async function addContact(album: Album, hash: string, contact: Contact) {
  updatePicasa(
    album,
    hash,
    [contact.originalName, contact.email, contact.something].join(";"),
    "Contacts2"
  );
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
          getFaceImageQueue.add(() => getFaceImage(entry, true))
        )
      );
    })
  );
  await getFaceImageQueue.drain();
}
