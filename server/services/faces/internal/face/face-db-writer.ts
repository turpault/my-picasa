/**
 * Faces writer component - runs in worker thread only. Writes to picisa_faces.db or .picasa.ini.
 * May import from face-db-reader. Never imported by main process.
 */
import {
  decodeFaces,
  encodeFaces,
} from "../../../../../shared/lib/utils";
import {
  AlbumEntry,
  AlbumEntryMetaData,
  Contact,
  Face,
} from "../../../../../shared/types/types";
import {
  addReferenceToFaceAlbum,
  removeReferenceToFaceAlbum,
} from "../../../../operations/faces/faces";
import {
  updateContactInAlbum,
} from "../../../walker/internal/picasa-ini";
import {
  getAlbumPicasaContactByHash,
  getEntryMetadata,
  getMutations,
} from "../../../walker/queries";

export async function addFaceRectToEntry(
  entry: AlbumEntry,
  rect: string,
  contact: Contact,
  referenceId: string,
) {
  const name = "faces";
  const current = await getEntryMetadata(entry);
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

export async function addCandidateFaceRectToEntry(
  entry: AlbumEntry,
  rect: string,
  hash: string,
  contact: Contact,
  referenceId: string,
  strategy: string,
) {
  const { getFacesWorkerStorage } = await import("./faces-worker-storage");
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
  const current = await getEntryMetadata(entry);
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
  const current = await getEntryMetadata(entry);
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
