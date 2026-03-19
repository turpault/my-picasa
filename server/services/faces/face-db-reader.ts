/**
 * Faces reader component - read-only. Used by main process only.
 * Never imports from worker-database, faces-worker-storage, run-faces-worker, or worker-thread (writer).
 */
import {
  decodeFaces,
  idFromAlbumEntry,
} from "../../../shared/lib/utils";
import {
  Album,
  AlbumEntry,
  AlbumEntryMetaData,
  Contact,
  ContactByHash,
  Face,
  FaceList,
  Reference,
} from "../../../shared/types/types";
import { readReferencesOfEntry } from "../../rpc/referenceFiles";
import {
  getAlbumEntries,
  getAllAlbums,
  getAlbumPicasaContactByHash,
  getContactsFromAlbum,
  getEntryMetadata,
} from "../walker/queries";

type PicasaFeatures = {
  contacts: ContactByHash;
  facesByEntry: {
    [entryId: string]: FaceList;
  };
};

let _picasaFeaturesCache: PicasaFeatures | null = null;

export async function getPicasaFeatures(): Promise<PicasaFeatures> {
  if (_picasaFeaturesCache) {
    return _picasaFeaturesCache;
  }
  _picasaFeaturesCache = {
    contacts: {},
    facesByEntry: {},
  };
  const albums = await getAllAlbums();
  await Promise.all(
    albums.map(async (album) => {
      const entries = await getAlbumEntries(album);
      const contacts = await getContactsFromAlbum(album);
      _picasaFeaturesCache!.contacts = {
        ..._picasaFeaturesCache!.contacts,
        ...contacts,
      };
      for (const entry of entries) {
        const entryMeta = await getEntryMetadata(entry);
        const faceString = entryMeta.faces;
        const faces = faceString ? decodeFaces(faceString) : [];
        _picasaFeaturesCache!.facesByEntry[idFromAlbumEntry(entry)] = faces;
      }
    }),
  );
  return _picasaFeaturesCache;
}

export async function getFaceDataFromAlbumEntry(entry: AlbumEntry) {
  const names = { faces: true, candidateFaces: false };
  const promises: Promise<{
    face: Face;
    contact: Contact;
    isCandidate?: boolean;
    referenceData?: Reference;
  }>[] = [];
  const current = await getEntryMetadata(entry);
  const referenceData = await readReferencesOfEntry(entry);
  for (const [name, isCandidate] of Object.entries(names)) {
    const iniFaces = (current as AlbumEntryMetaData)[name as keyof AlbumEntryMetaData] || "";
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

async function getContact(album: Album, hash: string): Promise<Contact> {
  return await getAlbumPicasaContactByHash(album, hash);
}
