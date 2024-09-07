import * as faceapi from "@vladmandic/face-api";
import Debug from "debug";
import { Queue } from "../../../shared/lib/queue";

import { Album, Reference } from "../../../shared/types/types";
import { media } from "../../../server/rpc/rpcFunctions/albumUtils";
import { getFolderAlbums } from "../../../server/walker";
import {
  createCandidateThumbnail,
  findFaceInRect,
  getPicasaIdentifiedReferences,
  isIdentifiedContactInReferences,
  isUsefulReference,
  rectOfReference,
} from "./face-utils";
import {
  getContactByContactKey,
  getContacts,
} from "../../../server/rpc/albumTypes/contacts";
import {
  addCandidateFaceRectToEntry,
  removeFaceFromEntry,
} from "./picasa-faces";
import { readReferencesOfEntry } from "../../../server/rpc/albumTypes/referenceFiles";

let identifiedReferenceContactKeyMap = new Map<string, Reference[]>(); //  contact.Key -> reference[]
const debug = Debug("app:face-matcher");

export async function runFaceMatcherStrategy() {
  await populateDatabase();
  await populateCandidates();
}

async function populateDatabase() {
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
            if (
              !isIdentifiedContactInReferences(identifiedContact, references)
            ) {
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
            if (!isUsefulReference(reference, "child")) {
              continue;
            }

            const identifiedContact = findFaceInRect(
              reference.data,
              identifiedContacts,
            );
            if (identifiedContact) {
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
async function pruneSimilarReferences() {
  const contacts = await getContacts();
  for (const contact of contacts) {
    debug(`pruneSimilarReferences: Processing contact ${contact.originalName}`);
    // ignore references for that contact too close from each other
    const references = identifiedReferenceContactKeyMap.get(contact.key)!;
    if (references && references.length > 1) {
      debug(
        `pruneSimilarReferences: Contact ${contact.originalName} has ${references.length} identified references`,
      );
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

      debug(
        `pruneSimilarReferences: Contact ${contact.originalName} Pruning complete ${references.length} left`,
      );
    }
  }
}
async function populateCandidates() {
  pruneSimilarReferences();

  let references: faceapi.LabeledFaceDescriptors[] = [];
  for (const [contactId, referenceList] of identifiedReferenceContactKeyMap) {
    references.push(
      new faceapi.LabeledFaceDescriptors(
        contactId,
        referenceList.map((r) => Float32Array.from(r.data.descriptor)),
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
      const bestMatch = matcher.findBestMatch(
        Float32Array.from(reference.data.descriptor),
      );
      if (bestMatch) {
        const contactKey = bestMatch.label;
        const contact = await getContactByContactKey(contactKey)!;

        if (contact) {
          addCandidateFaceRectToEntry(
            media,
            rectOfReference(reference.data),
            contact,
            reference.id,
            "facematcher",
          );
          await createCandidateThumbnail(
            contact.key,
            "facematcher",
            reference,
            media,
            false,
          );
        }
      }
    }
  }
}
