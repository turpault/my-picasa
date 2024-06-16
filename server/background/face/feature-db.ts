import * as faceapi from "@vladmandic/face-api";
import Debug from "debug";
import { Queue } from "../../../shared/lib/queue";

import {
  decodeFaces,
  decodeRect,
  encodeRect,
  mergeObjects,
} from "../../../shared/lib/utils";
import { Album, AlbumEntry, Contact, Face } from "../../../shared/types/types";
import { media } from "../../rpc/rpcFunctions/albumUtils";
import {
  readAlbumIni,
  readContacts,
  updateContactInAlbum,
} from "../../rpc/rpcFunctions/picasa-ini";
import { getFolderAlbums } from "../../walker";
import { addFaceRectToEntry, removeFaceFromEntry } from "./picasa-faces";
import {
  FaceLandmarkData,
  Reference,
  readReferencesOfEntry,
} from "./references";
import { addReferenceToFaceAlbum } from "../../rpc/albumTypes/faces";
const debug = Debug("app:face-db");
let identifiedReferenceContactKeyMap = new Map<string, Reference[]>(); //  contact.Key -> reference[]
const contacts = new Map<string, Contact>();
export async function populateDatabase() {
  const albums = await getFolderAlbums();
  for (const album of albums) {
    const medias = await media(album);
    debug(`populateDatabase: Processing album ${album.name}`);
    await Promise.all(
      medias.entries.map(async (media) => {
        const references = await readReferencesOfEntry(media);

        if (references) {
          // Add the identified reference
          const identifiedContacts = await getPicasaIdentifiedReferences(media);
          // Remove entries that have not been identified as a face here
          for (const identifiedContact of identifiedContacts.slice()) {
            if (!isIdenfiedContactInReferences(identifiedContact, references)) {
              debug(
                `populateDatabase: Removing face ${identifiedContact.face.hash} from ${media.name} - not in the list of references`,
              );
              identifiedContacts.splice(
                identifiedContacts.indexOf(identifiedContact),
                1,
              );
              removeFaceFromEntry(
                media,
                identifiedContact.face,
                identifiedContact.contact,
              );
            }
          }
          for (const reference of references) {
            const descriptors = reference.data.descriptor;
            if (!descriptors) {
              continue;
            }

            const identifiedContact = findFaceInRect(
              reference.data,
              identifiedContacts,
            );
            if (identifiedContact) {
              const contact = mergeObjects(
                contacts.get(identifiedContact.contact.key),
                identifiedContact.contact,
              );

              contacts.set(identifiedContact.contact.key, contact);
              // Update the contact in the album
              addReferenceToFaceAlbum(
                identifiedContact.face,
                reference.id,
                contact,
              );
              updateContactInAlbum(album, identifiedContact.face.hash, contact);
              if (
                !identifiedReferenceContactKeyMap.has(
                  identifiedContact.contact.key,
                )
              ) {
                identifiedReferenceContactKeyMap.set(
                  identifiedContact.contact.key,
                  [reference],
                );
              } else {
                identifiedReferenceContactKeyMap
                  .get(identifiedContact.contact.key)!
                  .push(reference);
              }
            }
          }
        }
      }),
    );
  }
}
const FILTER_MAX_DISTANCE = 0.6;
function pruneSimilarReferences() {
  for (const contact of contacts.values()) {
    debug(`pruneSimilarReferences: Processing contact ${contact.originalName}`);
    // ignore references for that contact too close from each other
    const references = identifiedReferenceContactKeyMap.get(contact.key)!;
    debug(
      `pruneSimilarReferences: Contact ${contact.originalName} has ${references.length} identified references`,
    );
    if (references.length > 1) {
      for (const reference of references) {
        for (const otherReference of references.slice(
          references.indexOf(reference) + 1,
        )) {
          if (reference === otherReference) continue;
          const descriptor = reference.data.descriptor;
          const descriptor1 = otherReference.data.descriptor;
          if (
            faceapi.euclideanDistance(descriptor, descriptor1) <
            FILTER_MAX_DISTANCE
          ) {
            references.splice(references.indexOf(otherReference), 1);
            break;
          }
        }
      }
    }
    debug(
      `pruneSimilarReferences: Contact ${contact.originalName} Pruning complete ${references.length} left`,
    );
  }
}
export async function populateCandidates() {
  pruneSimilarReferences();

  let references: faceapi.LabeledFaceDescriptors[] = [];
  for (const [contactId, referenceList] of identifiedReferenceContactKeyMap) {
    references.push(
      new faceapi.LabeledFaceDescriptors(
        contactId,
        referenceList.map((r) => r.data.descriptor),
      ),
    );
  }
  const matcher = new faceapi.FaceMatcher(references);

  // Limit the parallelism for the face parsing
  const faceProcessingQueue = new Queue(30);
  const albums = await getFolderAlbums();
  for (const album of albums) {
    faceProcessingQueue.add(async () => {
      await populateCandidatesOfAlbum(album, matcher).catch(debug);
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

async function populateCandidatesOfAlbum(
  album: Album,
  matcher: faceapi.FaceMatcher,
) {
  const medias = await media(album);
  debug(`populateCandidatesOfAlbum: Processing album ${album.name}`);
  for (const media of medias.entries) {
    const references = await readReferencesOfEntry(media);
    if (!references) continue;
    for (const reference of references) {
      const bestMatch = matcher.findBestMatch(reference.data.descriptor);
      if (bestMatch) {
        const contactKey = bestMatch.label;
        const contact = contacts.get(contactKey)!;

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

function rectOfReference(feature: FaceLandmarkData) {
  const left = feature.alignedRect.box.left / feature.detection.imageWidth;
  const right = feature.alignedRect.box.right / feature.detection.imageWidth;
  const top = feature.alignedRect.box.top / feature.detection.imageHeight;
  const bottom = feature.alignedRect.box.bottom / feature.detection.imageHeight;

  const rect = encodeRect({ top, left, right, bottom });
  return rect;
}

type IdentifiedContact = { face: Face; contact: Contact };

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
      .map((face) => ({ face, contact: contacts[face.hash] }));
  }
  return [];
}

function isIdenfiedContactInReferences(
  identifiedContact: IdentifiedContact,
  references: Reference[],
) {
  return references.some((reference) =>
    findFaceInRect(reference.data, [identifiedContact]),
  );
}

function findFaceInRect(
  reference: FaceLandmarkData,
  identifiedContacts: IdentifiedContact[],
) {
  const { width, height } = reference.detection.imageDims;
  const proximity = (a: IdentifiedContact, b: FaceLandmarkData) => {
    const rect = decodeRect(a.face.rect);
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
