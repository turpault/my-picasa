import {
  Album,
  AlbumEntry,
  AlbumKind,
  AlbumWithData,
  Contact,
  Face,
  FaceData,
  keyFromID,
} from "../../../shared/types/types";
import { rectOfReference } from "../../services/faces/face/face-utils";
import {
  decodeReferenceId,
  readReferenceFromReferenceId,
} from "../albumTypes/referenceFiles";
import {
  albumFromNameAndKind,
  deletePicasaSection,
  listAlbumsOfKind,
  getPicasaEntries,
  writeFaceAlbumContact,
  writeFaceAlbumEntry,
} from "./picasa-ini";

export async function eraseFace(entry: AlbumEntry) {
  throw "Not implemented";
}

export async function getFaceRect(referenceId: string): Promise<string> {
  const reference = await readReferenceFromReferenceId(referenceId);
  if (!reference) {
    throw "Reference not found";
  }
  return rectOfReference(reference.data);
}

export async function getFaceData(entry: AlbumEntry): Promise<FaceData> {
  const reference = await readReferenceFromReferenceId(entry.name);
  const { entry: originalEntry } = decodeReferenceId(entry.name);
  if (!reference) {
    throw "Reference not found";
  }
  // FIXME - This is a hack to get the contact name
  return {
    label: reference.id,
    originalEntry,
    hash: "cluster.id",
    rect: rectOfReference(reference.data),
  };
}

export async function readFaceAlbumEntries(
  album: Album,
): Promise<AlbumEntry[]> {
  return await getPicasaEntries(album);
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
    writeFaceAlbumContact(album, contact);
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
  writeFaceAlbumEntry(faceAlbum, referenceId, face);
  faceAlbum.count = (await getPicasaEntries(faceAlbum)).length;
}

export async function removeReferenceToFaceAlbum(
  contact: Contact,
  referenceId: string,
) {
  const faceAlbum = getFaceAlbum(contact);
  deletePicasaSection(faceAlbum, referenceId);
  faceAlbum.count = (await getPicasaEntries(faceAlbum)).length;
}

const faceAlbums: AlbumWithData[] = [];
export async function loadFaceAlbums() {
  const l = await listAlbumsOfKind(AlbumKind.FACE);
  for (const album of l) {
    const entries = await getPicasaEntries(album);
    faceAlbums.push({ ...album, count: entries.length });
  }
}

export function getFaceAlbums() {
  return faceAlbums;
}
