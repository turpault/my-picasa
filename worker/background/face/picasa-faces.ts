import {
  decodeFaces,
  encodeFaces,
  idFromAlbumEntry,
} from "../../../shared/lib/utils";
import {
  FaceList,
  Album,
  AlbumEntry,
  Contact,
  ContactByHash,
  Face,
  AlbumEntryMetaData,
  Reference,
} from "../../../shared/types/types";
import {
  addReferenceToFaceAlbum,
  removeReferenceToFaceAlbum,
} from "../../../server/rpc/rpcFunctions/faces";
import { media } from "../../../server/rpc/rpcFunctions/albumUtils";
import {
  PicasaBaseKeys,
  getPicasaEntry,
  readAlbumIni,
  readContacts,
  readPicasaSection,
  updatePicasa,
  updatePicasaEntry,
  writePicasaSection,
} from "../../../server/rpc/rpcFunctions/picasa-ini";
import { getFolderAlbums, waitUntilWalk } from "../../../server/walker";
import { readReferencesOfEntry } from "../../../server/rpc/albumTypes/referenceFiles";

type PicasaFeatures = {
  contacts: ContactByHash;
  facesByEntry: {
    [entryId: string]: FaceList;
  };
};

export async function getPicasaFeatures(): Promise<PicasaFeatures> {
  await waitUntilWalk();
  const self = getPicasaFeatures as any;
  if (self._features) {
    return self._features;
  }
  self._features = {
    contacts: {},
    facesByEntry: {},
  } as PicasaFeatures;
  // Scan all the contacts
  const albums = await getFolderAlbums();
  await Promise.all(
    albums.map(async (album) => {
      const m = await media(album);
      const picasaIni = await readAlbumIni(album);
      self._features.contacts = {
        ...self._features.contacts,
        ...readContacts(picasaIni),
      };
      for (const entry of m.entries) {
        const faceString = picasaIni[entry.name]?.faces;
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
  const current = await getPicasaEntry(entry);
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
    updatePicasaEntry(entry, name, encodeFaces(faces)),
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
  const current = await getPicasaEntry(entry);
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
  contact: Contact,
  referenceId: string,
  strategy: string,
) {
  const name = `candidateFaces-${strategy}`;
  const current = await readPicasaSection(entry.album, name);
  const iniFaces = current[entry.name] || "";
  const faces = decodeFaces(iniFaces);
  if (faces.find((f) => f.hash === referenceId)) {
    return;
  }
  const face: Face = {
    hash: referenceId,
    rect,
  };
  faces.push(face);
  current[entry.name] = encodeFaces(faces);
  await Promise.all([
    addContact(entry.album, referenceId, contact),
    addReferenceToFaceAlbum(face, referenceId, contact),
    writePicasaSection(entry.album, name, current),
  ]);
  return;
}

export async function removeFaceFromEntry(
  entry: AlbumEntry,
  face: Face,
  contact: Contact,
) {
  const current = await getPicasaEntry(entry);
  for (const name of [
    "faces",
    "candidateFaces",
  ] as (keyof AlbumEntryMetaData)[]) {
    const iniFaces = (current[name] as string) || "";
    const faces = decodeFaces(iniFaces);
    const newFaces = faces.filter((f) => f.hash !== face.hash);
    if (faces.length !== newFaces.length) {
      removeReferenceToFaceAlbum(contact, face.hash);
      updatePicasaEntry(entry, name, encodeFaces(newFaces));
    }
  }
  return;
}

async function addContact(album: Album, hash: string, contact: Contact) {
  updatePicasa(
    album,
    hash,
    [contact.originalName, contact.email, contact.something].join(";"),
    PicasaBaseKeys.Contacts2,
  );
}

async function getContact(album: Album, hash: string): Promise<Contact> {
  const section = await readPicasaSection(album, PicasaBaseKeys.Contacts2);
  const data = section[hash];
  if (!data) {
    throw new Error(`Contact not found for hash ${hash}`);
  }
  const [originalName, email, something] = data.split(";");
  return { key: originalName, originalName, email, something };
}
