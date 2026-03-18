import {
  decodeFaces,
  encodeFaces,
  idFromAlbumEntry,
} from "../../../../../shared/lib/utils";
import {
  Album,
  AlbumEntry,
  AlbumEntryMetaData,
  Contact,
  ContactByHash,
  Face,
  FaceList,
  Reference,
} from "../../../../../shared/types/types";
import {
  addReferenceToFaceAlbum,
  removeReferenceToFaceAlbum,
} from "../../../../operations/faces/faces";
import { readReferencesOfEntry } from "../../../../rpc/referenceFiles";
import {
  updateContactInAlbum,
} from "../../../walker/internal/picasa-ini";
import {
  getAlbumEntries,
  getAllAlbums,
  getAlbumPicasaContactByHash,
  getContactsFromAlbum,
  getEntryMetadata,
  getMutations,
} from "../../../walker/queries";
import { getFacesWorkerStorage } from "./faces-worker-storage";

type PicasaFeatures = {
  contacts: ContactByHash;
  facesByEntry: {
    [entryId: string]: FaceList;
  };
};

export async function getPicasaFeatures(): Promise<PicasaFeatures> {
  const self = getPicasaFeatures as any;
  if (self._features) {
    return self._features;
  }
  self._features = {
    contacts: {},
    facesByEntry: {},
  } as PicasaFeatures;
  // Scan all the contacts
  const albums = await getAllAlbums();
  await Promise.all(
    albums.map(async (album) => {
      const entries = await getAlbumEntries(album);
      const contacts = await getContactsFromAlbum(album);
      self._features.contacts = {
        ...self._features.contacts,
        ...contacts,
      };
      for (const entry of entries) {
        const entryMeta = getEntryMetadata(entry);
        const faceString = entryMeta.faces;
        const faces = faceString ? decodeFaces(faceString) : [];
        self._features.facesByEntry[idFromAlbumEntry(entry)] = faces;
      }
    }),
  );
  return self._features;
}

export async function addFaceRectToEntry(
  entry: AlbumEntry,
  rect: string,
  contact: Contact,
  referenceId: string,
) {
  const name = "faces";
  const current = getEntryMetadata(entry);
  const iniFaces = current[name] || "";
  const faces = decodeFaces(iniFaces);
  if (faces.find((f) => f.hash === referenceId)) {
    return;
  }
  const face: Face = {
    hash: referenceId,
    rect,
  };
  faces.push(face);
  await Promise.all([
    addContact(entry.album, referenceId, contact),
    addReferenceToFaceAlbum(face, referenceId, contact),
    getMutations().updateEntryMetadata(entry, name, encodeFaces(faces)),
  ]);
  return;
}

export async function getFaceDataFromAlbumEntry(entry: AlbumEntry) {
  const names = { faces: true, candidateFaces: false };
  const promises: Promise<{
    face: Face;
    contact: Contact;
    isCandidate?: boolean;
    referenceData?: Reference;
  }>[] = [];
  const current = getEntryMetadata(entry);
  const referenceData = await readReferencesOfEntry(entry);
  for (const [name, isCandidate] of Object.entries(names)) {
    const iniFaces = (current as any)[name] || "";
    const faces = decodeFaces(iniFaces);
    promises.push(
      ...faces.map(async (face) => {
        const contact = await getContact(entry.album, face.hash);
        return {
          face,
          contact,
          isCandidate,
          referenceData: referenceData?.find((r) => r.id === face.hash),
        };
      }),
    );
  }
  return Promise.all(promises);
}

export async function addCandidateFaceRectToEntry(
  entry: AlbumEntry,
  rect: string,
  hash: string,
  contact: Contact,
  referenceId: string,
  strategy: string,
) {
  const ws = getFacesWorkerStorage();
  if (ws) {
    await ws.addContact(entry.album, referenceId, contact);
    await addReferenceToFaceAlbum(
      { hash, rect },
      referenceId,
      contact,
    );
    await ws.addFaceRect(entry, hash, rect);
    return;
  }

  const name = `candidateFaces-${strategy}`;
  const current = getEntryMetadata(entry);
  const iniFaces = (current[name as keyof AlbumEntryMetaData] as string) || "";
  const faces = decodeFaces(iniFaces);
  if (faces.find((f) => f.hash === hash)) {
    return;
  }
  const face: Face = {
    hash,
    rect,
  };
  faces.push(face);
  await Promise.all([
    addContact(entry.album, referenceId, contact),
    addReferenceToFaceAlbum(face, referenceId, contact),
    getMutations().updateEntryMetadata(entry, name, encodeFaces(faces)),
  ]);
  return;
}

export async function removeFaceFromEntry(
  entry: AlbumEntry,
  face: Face,
  contact: Contact,
) {
  const current = getEntryMetadata(entry);
  for (const name of [
    "faces",
    "candidateFaces",
  ] as (keyof AlbumEntryMetaData)[]) {
    const iniFaces = (current[name] as string) || "";
    const faces = decodeFaces(iniFaces);
    const newFaces = faces.filter((f) => f.hash !== face.hash);
    if (faces.length !== newFaces.length) {
      removeReferenceToFaceAlbum(contact, face.hash);
      getMutations().updateEntryMetadata(entry, name, encodeFaces(newFaces));
    }
  }
  return;
}

async function addContact(album: Album, hash: string, contact: Contact) {
  await updateContactInAlbum(album, hash, contact);
}

async function getContact(album: Album, hash: string): Promise<Contact> {
  return await getAlbumPicasaContactByHash(album, hash);
}

