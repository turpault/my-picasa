import {
  Album,
  AlbumEntry,
  AlbumWithData,
  Contact,
  Face,
  FaceData,
  personKeyFromName,
} from "../../../shared/types/types";
import { rectOfReference } from "./face-utils";
import {
  decodeReferenceId,
  readReferenceFromReferenceId,
} from "../../rpc/referenceFiles";
import {
  albumFromName,
  deletePicasaSection,
  listFolders,
  writeFaceAlbumContact,
  writeFaceAlbumEntry,
} from "../../services/walker/internal/picasa-ini";
import { getAlbumEntries } from "../../services/walker/queries";

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
  return getAlbumEntries(album);
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
  const name = typeof contact === "string" ? contact : contact.name;
  const album: Album = {
    name,
    key: personKeyFromName(name),
  };
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
  faceAlbum.count = getAlbumEntries(faceAlbum).length;
}

export async function removeReferenceToFaceAlbum(
  contact: Contact,
  referenceId: string,
) {
  const faceAlbum = getFaceAlbum(contact);
  deletePicasaSection(faceAlbum, referenceId);
  faceAlbum.count = getAlbumEntries(faceAlbum).length;
}

const faceAlbums: AlbumWithData[] = [];
export async function loadFaceAlbums() {
  // Face albums are stored in .faces folder
  // List all .ini files in the faces folder
  const { readdir } = await import("fs/promises");
  const { join, basename } = await import("path");
  const { facesFolder } = await import("../../utils/constants");
  const { fileExists } = await import("../../utils/serverUtils");

  if (!(await fileExists(facesFolder))) {
    return;
  }

  const files = await readdir(facesFolder);
  const iniFiles = files.filter((file) => file.endsWith(".ini") && !file.startsWith("."));

  for (const iniFile of iniFiles) {
    const name = basename(iniFile, ".ini");
    const album: Album = {
      name,
      key: personKeyFromName(name),
    };
    const entries = getAlbumEntries(album);
    faceAlbums.push({ ...album, count: entries.length });
  }
}

/**
 * Get all contact (face) albums
 */
export function getContactAlbums(): AlbumWithData[] {
  return faceAlbums;
}

export function getFaceAlbums() {
  return faceAlbums;
}
