import { Queue } from "../../../shared/lib/queue";
import {
  buildReadySemaphore,
  encodeRect,
  fromBase64,
  setReady,
  uuid,
} from "../../../shared/lib/utils";
import {
  Album,
  AlbumEntry,
  AlbumKind,
  AlbumMetaData,
  AlbumWithData,
  Contact,
  FaceData,
  HashInAlbumList,
  keyFromID,
} from "../../../shared/types/types";
import { media } from "../rpcFunctions/albumUtils";
import {
  getPicasaEntry,
  listAlbumsOfKind,
  readAlbumEntries,
  readAlbumIni,
  updatePicasa,
  updatePicasaEntry,
} from "../rpcFunctions/picasa-ini";
import { deleteFaceImage, getFaceImage } from "../rpcFunctions/thumbnail";
import { join } from "path";
import { facesFolder } from "../../utils/constants";
import { readFile } from "fs/promises";
import { getFolderAlbums, waitUntilWalk } from "../../walker";
import { isString } from "util";

const readyLabelKey = "faceWalker";
const ready = buildReadySemaphore(readyLabelKey);

export type FaceAlbumWithData = AlbumWithData & { hash: string[] } & {
  [key: string]: any;
};

export async function eraseFace(entry: AlbumEntry) {
  if (entry.album.kind !== AlbumKind.FACE) {
    throw new Error("Not a face album");
  }
  await deleteFaceImage(entry);
  const d = await getFaceData(entry);

  const originalImageEntry = d.originalEntry;
  // entry.name is the face hash
  updatePicasa(entry.album, null, null, entry.name);

  // Update entry in original picasa.ini
  let iniFaces = (await getPicasaEntry(originalImageEntry))?.faces;
  if (iniFaces) {
    iniFaces = iniFaces
      .split(";")
      .filter((f) => !f.includes(`,${d.hash}`))
      .join(";");
    updatePicasaEntry(originalImageEntry, "faces", iniFaces);
  }
}

export function getFaceAlbums(): FaceAlbumWithData[] {
  return Object.values(faceAlbumsByName);
}

export async function loadFaceAlbums() {
  await loadReferenceFeatures();

  const faceAlbums = await listAlbumsOfKind(AlbumKind.FACE);
  const albumAndData: [Album, AlbumEntry[]][] = await Promise.all(
    faceAlbums.map(async (album) => [album, await readFaceAlbumEntries(album)])
  );
  const albumWithData: AlbumWithData[] = albumAndData.map((a) => ({
    ...a[0],
    count: a[1].length,
  }));
  for (const albumData of albumWithData)
    faceAlbumsByName[albumData.key] = { ...albumData, hash: [] };
  setReady(readyLabelKey);
}

export async function faceAlbumsReady() {
  await ready;
}

export async function getFaceData(entry: AlbumEntry): Promise<FaceData> {
  const picasaEntry = await getPicasaEntry(entry);
  const originalEntry: AlbumEntry = {
    album: {
      key: picasaEntry.originalAlbumKey!,
      name: picasaEntry.originalAlbumName!,
      kind: AlbumKind.FOLDER,
    },
    name: picasaEntry.originalName!,
  };

  const [albumKey, label, face] = JSON.parse(fromBase64(entry.name));
  return { originalEntry, label, ...face, faceAlbum: entry.album };
}

export async function readFaceAlbumEntries(
  album: Album
): Promise<AlbumEntry[]> {
  return await readAlbumEntries(album);
}

export async function getFaceAlbumsWithData(
  _filter: string = ""
): Promise<AlbumWithData[]> {
  // Create 'fake' albums with the faces
  await ready;
  return getFaceAlbums();
}

/**
 * Merge all the contents of withFace into face
 * @param face
 * @param withFace
 * @returns
 */
export async function mergeFaces(face: string, withFace: string) {
  // Find all the albums where the hashes for the withFace album appears, and reassign them
  const inAlbum = faceAlbumsByName[face];
  if (!inAlbum) {
    throw `Face album ${face} not found`;
  }
  const fromAlbum = faceAlbumsByName[withFace];
  if (!fromAlbum) {
    throw `Face album ${withFace} not found`;
  }
  const toEntries = await media(inAlbum);
  const fromEntries = await media(fromAlbum);
  for (const entry of fromEntries.entries) {
    const faceData = await getFaceData(entry);

    faceData.hash;
  }
}

let faceAlbumsByName: { [name: string]: FaceAlbumWithData } = {};
export function getFaceAlbumsByName() {
  return faceAlbumsByName;
}

export function updateFaceAlbumsByName(key: string, album: FaceAlbumWithData) {
  faceAlbumsByName[key] = album;
}

export function normalizeName(name: string): string {
  return name.toLowerCase().replace(/^[a-z]|[\s|-][a-z]/gi, (s) => {
    return s.toUpperCase();
  });
}
let allContacts: { [contactKey: string]: Contact } = {};

export function getAllContacts() {
  return allContacts;
}

let faceAlbumsByHash: { [hash: string]: FaceAlbumWithData } = {};
export function getFaceAlbumFromHash(hash: string): FaceAlbumWithData {
  return faceAlbumsByHash[hash];
}

export function addFaceAlbumByHash(hash: string, faceAlbum: FaceAlbumWithData) {
  faceAlbumsByHash[hash] = faceAlbum;
}

export async function loadReferenceFeatures() {
  // Scan all the contacts
  const albums = await getFolderAlbums();
  for (const album of albums) {
    const picasaIni = await readAlbumIni(album);
    const contacts = readContacts(picasaIni);
    const faceAlbumsByName = getFaceAlbumsByName();
    for (const [hash, contact] of Object.entries(contacts)) {
      allContacts[contact.key] = contact;
      if (!faceAlbumsByName[contact.key]) {
        const faceAlbum: FaceAlbumWithData = {
          count: 0,
          name: contact.originalName,
          key: contact.key,
          hash: [],
          kind: AlbumKind.FACE,
        };
        faceAlbumsByName[contact.key] = faceAlbum;
      }
      const faceAlbum = faceAlbumsByName[contact.key]!;

      faceAlbumsByHash[hash] = faceAlbum;
    }
  }
}

export function readContacts(picasaIni: AlbumMetaData): HashInAlbumList {
  if (picasaIni.Contacts2) {
    // includes a map of faces/ids
    return Object.fromEntries(
      Object.entries(picasaIni.Contacts2 as { [key: string]: string })
        .map(([hash, value]) => {
          if (typeof value === "string" && value.includes(";")) {
            const [originalName, email, something] = value.split(";");
            const name = normalizeName(originalName);
            const key = keyFromID(name, AlbumKind.FACE);
            return [hash, { originalName, email, something, name, key }];
          } else {
            return [hash, null];
          }
        })
        .filter((v) => v[1] !== null)
    );
  }
  return {};
}

/**
 *
 * @returns
 */

/*
let data = { ...(await readAlbumIni(album)) };

const faceIds: string[] = [];
for (const [id, val] of faces.entries()) {
  if (val.name.toLowerCase().includes(normalizedFilter)) {
    faceIds.push(id);
  }
}
const res: AlbumEntry[] = [];
Object.entries(data).forEach(([name, picasaEntry]) => {
  if (name.toLowerCase().includes(normalizedFilter)) {
    res.push({ album, name });
    return;
  }
  if (album.name.toLowerCase().includes(normalizedFilter)) {
    res.push({ album, name });
    return;
  }
  if (picasaEntry.faces) {
    for (const id of faceIds) {
      if (picasaEntry.faces.includes(id)) {
        res.push({ album, name });
        return;
      }
    }
  }
});
if (res.length > 0) {
}
return res;
*/
