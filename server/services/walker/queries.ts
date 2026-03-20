import { Album, AlbumEntry, AlbumEntryMetaData, AlbumMetaData, AlbumWithData, Contact, ContactByHash, Face, PicasaSection, Shortcut, ThumbnailSize } from "../../../shared/types/types";
import { getWalkerDatabase } from "./internal/database";
import {
  refreshAlbumKeys as refreshAlbumKeysImpl,
  refreshAlbums as refreshAlbumsImpl,
  onRenamedAlbums as onRenamedAlbumsImpl,
  reindexAlbums as reindexAlbumsImpl,
} from "./internal/walk";
import {
  updateEntryMetadata,
  setCaption,
  setFilters,
  setRotate,
  toggleStar,
  rotate,
  updateAlbumShortcut,
  touchPicasaEntry,
} from "./internal/mutations";
import {
  getPicasaIdentifiedReferences as readPicasaIdentifiedReferences,
  getAlbumPicasaContactByHash as readAlbumPicasaContactByHash,
} from "./internal/picasa-read-queries";
import type { WalkerWorkerClientApi } from "../../../shared/rpc-contracts";

// Re-export from picasa-ini for compatibility
export {
  albumFromName,
  albumFromNameAndKind,
  getContactsFromAlbum,
} from "./internal/picasa-ini";

/**
 * Walker Database Queries (Read-only)
 * 
 * This module provides read-only access to the walker database.
 * Can be used in the main thread or any service.
 */

export async function getAllAlbums(): Promise<AlbumWithData[]> {
  const db = getWalkerDatabase();
  return db.getAllAlbums();
}

export async function getAlbum(albumKey: string): Promise<AlbumWithData | undefined> {
  const db = getWalkerDatabase();
  return db.getAlbum(albumKey);
}

export async function getAlbumEntries(album: Album): Promise<AlbumEntry[]> {
  const db = getWalkerDatabase();
  return db.getAlbumEntries(album);
}

/**
 * Get metadata for an entry (read-only operation)
 * This reads directly from the database. No worker delegation needed.
 * If metadata is empty in DB, returns empty object - metadata will be synced from picasa-ini by worker.
 */
export async function getEntryMetadata(entry: AlbumEntry): Promise<AlbumEntryMetaData> {
  const db = getWalkerDatabase();
  return db.getEntryMetadata(entry);
}

/**
 * Get shortcuts map (read-only operation)
 * Reads directly from the database.
 */
export async function getShortcuts(): Promise<Shortcut[]> {
  const db = getWalkerDatabase();
  return db.getShortcuts();
}

/**
 * Read shortcut for an album (read-only operation)
 * Reads directly from the database.
 */
export async function readShortcut(album: Album): Promise<string | undefined> {
  const db = getWalkerDatabase();
  return db.getAlbumShortcut(album.key);
}

/**
 * Read persons from entry metadata
 */
export async function readPersons(entry: AlbumEntry): Promise<string[]> {
  const metadata = await getEntryMetadata(entry);
  const persons = metadata.persons || "";
  return persons.split(",").map((p) => p.trim());
}

/**
 * Get album metadata (read-only operation)
 * Reads directly from the database by reconstructing from entry metadata.
 */
export async function getAlbumMetaData(album: Album): Promise<AlbumMetaData> {
  const db = getWalkerDatabase();
  return db.getAlbumMetaData(album);
}

/**
 * Local mutations implementation - walker runs in main thread.
 */
const mutationsClient: WalkerWorkerClientApi = {
  updateEntryMetadata,
  setCaption,
  setFilters,
  setRotate,
  toggleStar,
  rotate,
  updateAlbumShortcut,
  touchPicasaEntry,
  refreshAlbumKeys: refreshAlbumKeysImpl,
  refreshAlbums: refreshAlbumsImpl,
  onRenamedAlbums: onRenamedAlbumsImpl,
  reindexAlbums: reindexAlbumsImpl,
  getPicasaIdentifiedReferences: readPicasaIdentifiedReferences,
  getAlbumPicasaContactByHash: readAlbumPicasaContactByHash,
  on: () => () => {},
};

export function getMutationsIfAvailable(): WalkerWorkerClientApi {
  return mutationsClient;
}

export function getMutations(): WalkerWorkerClientApi {
  return mutationsClient;
}

/**
 * Get identified references (faces with contacts) for an entry
 * This is an RPC call to the walker worker.
 */
export async function getPicasaIdentifiedReferences(entry: AlbumEntry): Promise<Array<{ face: Face; contact: Contact }>> {
  const client = getMutations();
  return await client.getPicasaIdentifiedReferences(entry);
}

/**
 * Get contact by hash from an album (renamed from getContactByHash)
 * This is an RPC call to the walker worker.
 */
export async function getAlbumPicasaContactByHash(album: Album, hash: string): Promise<Contact> {
  const client = getMutations();
  return await client.getAlbumPicasaContactByHash(album, hash);
}

