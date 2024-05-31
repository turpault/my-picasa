import Debug from "debug";
import { Queue } from "../../../shared/lib/queue";
import {
  Face,
  decodeFaces,
  decodeRect,
  encodeRect,
  range,
} from "../../../shared/lib/utils";
import { Album, AlbumEntry, Contact } from "../../../shared/types/types";
import { media } from "../../rpc/rpcFunctions/albumUtils";
import { readAlbumIni, readContacts } from "../../rpc/rpcFunctions/picasa-ini";
import { getFolderAlbums } from "../../walker";
import { getRedisClient } from "../poi/redis-client";
import { addFaceRectToEntry } from "./picasa-faces";
import { FaceLandmarkData, readReferencesOfEntry } from "./references";
const debug = Debug("app:face-db");
const qualifier = "all_reference";
const qualifier_identified = "identified_reference";
const qualifier_contact = "contact";
let identifiedContactHashes = new Map<string, string>();
export async function populateDatabase() {
  const client = await getRedisClient();
  await client.del(qualifier);
  await client.del(qualifier_identified);
  await client.del(qualifier_contact);
  const albums = await getFolderAlbums();
  for (const album of albums) {
    const medias = await media(album);
    debug(`populateDatabase: Processing album ${album.name}`);
    await Promise.all(
      medias.entries.map(async (media) => {
        const references = await readReferencesOfEntry(media);

        if (references) {
          for (const reference of references) {
            const referenceId = reference.id;
            const descriptors = reference.data.descriptor;
            if (!descriptors) {
              continue;
            }

            const hash = faceHashFromDescriptors(descriptors);
            await client.hset(qualifier, hash, referenceId);

            // Add the identified reference
            const identifiedContacts =
              await getPicasaIdentifiedReferences(media);
            for (const identifiedContact of identifiedContacts) {
              await client.hset(
                qualifier_contact,
                identifiedContact.contact.key,
                JSON.stringify(identifiedContact.contact),
              );
            }
            const identifiedContact = findFaceInRect(
              reference.data,
              identifiedContacts,
            );
            if (identifiedContact) {
              await client.hset(
                qualifier_identified,
                hash,
                JSON.stringify(identifiedContact),
              );
              identifiedContactHashes.set(
                hash,
                identifiedContact.contact.originalName,
              );
            }
          }
        }
      }),
    );
  }
  identifiedContactHashes = new Map(
    [...identifiedContactHashes.entries()].sort((a, b) =>
      a[0] > b[0] ? 1 : -1,
    ),
  );
}

export async function populateCandidates() {
  // Limit the parallelism for the face parsing
  const faceProcessingQueue = new Queue(30);
  const albums = await getFolderAlbums();
  for (const album of albums) {
    faceProcessingQueue.add(async () => {
      await populateCandidatesOfAlbum(album).catch(debug);
    });
  }
  const t = setInterval(
    () =>
      debug(
        `populateCandidates: Remaining ${faceProcessingQueue.length()} albums to process.`,
      ),
    2000,
  );
  await faceProcessingQueue.drain();
  clearInterval(t);
}

async function populateCandidatesOfAlbum(album: Album) {
  const client = await getRedisClient();
  const medias = await media(album);
  debug(`populateCandidatesOfAlbum: Processing album ${album.name}`);
  for (const media of medias.entries) {
    const references = await readReferencesOfEntry(media);
    if (references) {
      for (const reference of references) {
        const hash = faceHashFromDescriptors(reference.data.descriptor);
        if (identifiedContactHashes.has(hash)) {
          continue;
        }
        const closestHash = getClosestIdentifiedReference(hash);
        if (closestHash) {
          const contactStr = await client.hget(qualifier_identified, hash);
          const contact = contactStr ? JSON.parse(contactStr) : null;
          if (contact) {
            addFaceRectToEntry(
              media,
              rectOfReference(reference.data),
              contact,
              reference.id,
              true,
            );
          }
        }
      }
    }
  }
}

function rectOfReference(feature: FaceLandmarkData) {
  const left = feature.alignedRect.box.left / feature.detection.imageWidth;
  const right = feature.alignedRect.box.right / feature.detection.imageWidth;
  const top = feature.alignedRect.box.top / feature.detection.imageHeight;
  const bottom = feature.alignedRect.box.bottom / feature.detection.imageHeight;

  const rect = encodeRect({ top, left, right, bottom });
  return rect;
}

const minDistance = BigInt(0x100000000);
function getClosestIdentifiedReference(faceHash: string) {
  // Find the closest identified contact using dichotomy
  if (identifiedContactHashes.size === 0) {
    return null;
  }

  const candidates: string[] = [];
  let previous: string | undefined;
  for (const hash of identifiedContactHashes) {
    if (hash[0] > faceHash) {
      if (previous) {
        candidates.push(previous);
      }
      candidates.push(hash[0]);
      break;
    } else previous = hash[0];
  }

  const hashAsNumber = BigInt("0x" + faceHash);
  // Which one is the closest?
  const distances = candidates
    .map((hash) => hashAsNumber - BigInt("0x" + hash))
    .map((v) => (v < 0 ? -v : v));

  if (distances.length === 1 && distances[0] < minDistance) {
    return candidates[0];
  }
  if (distances.length === 2) {
    if (distances[0] < distances[1]) {
      if (distances[0] < minDistance) {
        return candidates[0];
      }
    } else {
      if (distances[1] < minDistance) {
        return candidates[1];
      }
    }
  }
  return null;
}

type IdentifiedContact = Face & {
  contact: Contact;
};
async function getPicasaIdentifiedReferences(
  entry: AlbumEntry,
): Promise<IdentifiedContact[]> {
  const picasaIni = await readAlbumIni(entry.album);

  const contacts = readContacts(picasaIni);
  const iniFaces = picasaIni[entry.name].faces;
  if (iniFaces) {
    const facesInEntry = decodeFaces(iniFaces);
    return facesInEntry
      .filter((face) => contacts[face.hash])
      .map((face) => ({ ...face, contact: contacts[face.hash] }));
  }
  return [];
}

function findFaceInRect(
  reference: FaceLandmarkData,
  identifiedContacts: IdentifiedContact[],
) {
  const { width, height } = reference.detection.imageDims;
  const proximity = (a: IdentifiedContact, b: FaceLandmarkData) => {
    const rect = decodeRect(a.rect);
    // Maps if each center is within the other rect
    const centerRect = {
      x: (rect.right + rect.left) / 2,
      y: (rect.top + rect.bottom) / 2,
    };
    const centerRef = {
      x: (b.alignedRect.box.x + b.alignedRect.box.width / 2) / width,
      y: (b.alignedRect.box.y + b.alignedRect.box.height / 2) / height,
    };
    if (
      centerRef.x < rect.left ||
      centerRef.x > rect.right ||
      centerRef.y < rect.top ||
      centerRef.y > rect.bottom
    )
      return false;
    if (
      centerRect.x < b.detection.box.x / width ||
      centerRect.x > b.detection.box.right / width ||
      centerRect.y < b.detection.box.y / height ||
      centerRect.y > b.detection.box.bottom / height
    )
      return false;
    return true;
  };

  for (const identifiedContact of identifiedContacts) {
    if (proximity(identifiedContact, reference)) {
      return identifiedContact;
    }
  }
  return null;
}

const precision = Math.pow(2, 31);
function faceHashFromDescriptors(descriptors: Float32Array) {
  const descriptorArray = Array.from(descriptors).map((f) =>
    Math.round((1 + f) * precision),
  );
  // slice the numbers bit by bit
  const asBin = descriptorArray.map((f) => f.toString(2).padStart(32, "0"));
  const finalBinaryValue = range(0, 31)
    .map((bit) => {
      return asBin.map((f) => f.slice(bit, bit + 1)).join("");
    })
    .join("");
  // compact into a hex string
  const hex = range(0, finalBinaryValue.length - 1, 4)
    .map((i) => parseInt(finalBinaryValue.slice(i, i + 4), 2).toString(16))
    .join("");
  // 128 descriptors * 32 bits = 4096 bits
  // or 1024 hex characters
  return hex.padStart(1024, "0");
}
