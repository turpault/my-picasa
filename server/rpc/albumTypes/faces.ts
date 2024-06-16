import {
  Face,
  Album,
  AlbumEntry,
  AlbumKind,
  AlbumWithData,
  Contact,
  FaceData,
} from "../../../shared/types/types";
import { Reference, decodeReferenceId } from "../../background/face/references";
import {
  PicasaBaseKeys,
  albumFromNameAndKind,
  deletePicasaSection,
  listAlbumsOfKind,
  readAlbumEntries,
  readAlbumIni,
  readPicasaSection,
  writePicasaSection,
} from "../rpcFunctions/picasa-ini";

export async function eraseFace(entry: AlbumEntry) {
  throw "Not implemented";
}

export async function getFaceData(entry: AlbumEntry): Promise<FaceData> {
  const referenceData = decodeReferenceId(entry.name);
  const contact = (await readPicasaSection(
    entry.album,
    PicasaBaseKeys.contact,
  )) as Contact;
  const face = (await readPicasaSection(entry.album, entry.name)) as Face;
  return {
    originalEntry: referenceData.entry,
    ...face,
    label: contact.originalName,
  };
}

export async function readFaceAlbumEntries(
  album: Album,
): Promise<AlbumEntry[]> {
  return await readAlbumEntries(album);
}

/**
 * Merge all the contents of withFace into face
 * @param face
 * @param withFace
 * @returns
 */
export async function mergeFaces(face: string, withFace: string) {
  throw "Not implemented";
}

export function getFaceAlbum(contact: Contact | string): AlbumWithData {
  const album = albumFromNameAndKind(
    typeof contact === "string" ? contact : contact.originalName,
    AlbumKind.FACE,
  );
  if (typeof contact !== "string") {
    writePicasaSection(album, PicasaBaseKeys.contact, contact);
  }
  let a = faceAlbums.find((a) => a.key === album.key);
  if (!a) {
    a = { ...album, count: 0 };
  }
  return a;
}

export function normalizeName(name: string): string {
  return name.toLowerCase().replace(/^[a-z]|[\s|-][a-z]/gi, (s) => {
    return s.toUpperCase();
  });
}

/**
 * Update the persons album with the face hash and rect
 * @param entry
 * @param face
 * @param contact
 */
export async function addReferenceToFaceAlbum(
  face: Face,
  referenceId: string,
  contact: Contact,
) {
  const faceAlbum = getFaceAlbum(contact);
  writePicasaSection(faceAlbum, referenceId, face);
  faceAlbum.count = (await readAlbumEntries(faceAlbum)).length;
}

export async function removeReferenceToFaceAlbum(
  contact: Contact,
  referenceId: string,
) {
  const faceAlbum = getFaceAlbum(contact);
  deletePicasaSection(faceAlbum, referenceId);
  faceAlbum.count = (await readAlbumEntries(faceAlbum)).length;
}

const faceAlbums: AlbumWithData[] = [];
export async function loadFaceAlbums() {
  const l = await listAlbumsOfKind(AlbumKind.FACE);
  for (const album of l) {
    const entries = await readAlbumEntries(album);
    faceAlbums.push({ ...album, count: entries.length });
  }
}

export function getFaceAlbums() {
  return faceAlbums;
}
