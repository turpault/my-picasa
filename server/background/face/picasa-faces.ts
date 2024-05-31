import {
  FaceList,
  decodeFaces,
  encodeFaces,
  idFromAlbumEntry,
} from "../../../shared/lib/utils";
import {
  Album,
  AlbumEntry,
  Contact,
  ContactByHash,
} from "../../../shared/types/types";
import { media } from "../../rpc/rpcFunctions/albumUtils";
import {
  getPicasaEntry,
  readAlbumIni,
  readContacts,
  updatePicasa,
  updatePicasaEntry,
} from "../../rpc/rpcFunctions/picasa-ini";
import { getFolderAlbums, waitUntilWalk } from "../../walker";

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
  candidate: boolean = false,
) {
  const name = candidate ? "candidateFaces" : "faces";
  const current = await getPicasaEntry(entry);
  const iniFaces = current[name] || "";
  const faces = decodeFaces(iniFaces);
  if (faces.find((f) => f.hash === referenceId)) {
    return;
  }
  faces.push({
    hash: referenceId,
    rect,
  });
  addContact(entry.album, referenceId, contact);
  return updatePicasaEntry(entry, name, encodeFaces(faces));
}

async function addContact(album: Album, hash: string, contact: Contact) {
  updatePicasa(
    album,
    hash,
    [contact.originalName, contact.email, contact.something].join(";"),
    "Contacts2",
  );
}
