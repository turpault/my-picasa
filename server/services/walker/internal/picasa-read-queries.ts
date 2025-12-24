import { Album, AlbumEntry, Contact } from "../../../../shared/types/types";
import { decodeFaces } from "../../../../shared/lib/utils";
import { Face } from "../../../../shared/types/types";
import { getContactsFromAlbum } from "./picasa-ini";
import { getWalkerDatabase } from "./database";

/**
 * Walker Service Read Queries (picasa-ini related)
 * 
 * These functions perform read operations on picasa-ini files.
 * These functions are ONLY called from walker-worker-rpc.ts (RPC handler in worker thread).
 * In the worker thread, they perform the actual operations directly on picasa-ini.
 */

export interface IdentifiedContact {
  face: Face;
  contact: Contact;
}

/**
 * Get identified references (faces with contacts) for an entry
 */
export async function getPicasaIdentifiedReferences(
  entry: AlbumEntry,
): Promise<IdentifiedContact[]> {
  const contacts = await getContactsFromAlbum(entry.album);
  const db = getWalkerDatabase();
  const entryMeta = db.getEntryMetadata(entry);
  const iniFaces = entryMeta.faces;
  if (iniFaces) {
    const facesInEntry = decodeFaces(iniFaces);
    return facesInEntry
      .filter((face: Face) => contacts[face.hash])
      .map((face: Face) => ({ face, contact: contacts[face.hash] }));
  }
  return [];
}

/**
 * Get contact by hash from an album (renamed from getContactByHash)
 */
export async function getAlbumPicasaContactByHash(
  album: Album,
  hash: string,
): Promise<Contact> {
  const contacts = await getContactsFromAlbum(album);
  const contact = contacts[hash];
  if (!contact) {
    throw new Error(`Contact not found for hash ${hash}`);
  }
  return contact;
}

