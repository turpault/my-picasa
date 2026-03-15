import { Album, AlbumEntry, AlbumEntryMetaData, AlbumMetaData, AlbumWithData, Contact, ContactByHash, extraFields, PicasaSection, Shortcut, ThumbnailSize } from "../../../shared/types/types";
import { getWalkerDatabase } from "./internal/database";
import {
  refreshAlbumKeys as refreshAlbumKeysImpl,
  refreshAlbums as refreshAlbumsImpl,
  onRenamedAlbums as onRenamedAlbumsImpl,
  reindexAlbums as reindexAlbumsImpl,
} from "./internal/worker-thread";
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
  getPicasaIdentifiedReferences,
  getAlbumPicasaContactByHash,
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

export function getAllAlbums(): AlbumWithData[] {
  const db = getWalkerDatabase();
  return db.getAllAlbums();
}

export function getAlbum(albumKey: string): AlbumWithData | undefined {
  const db = getWalkerDatabase();
  return db.getAlbum(albumKey);
}

export function getAlbumEntries(album: Album): AlbumEntry[] {
  const db = getWalkerDatabase();
  return db.getAlbumEntries(album);
}

/**
 * Get metadata for an entry (read-only operation)
 * This reads directly from the database. No worker delegation needed.
 * If metadata is empty in DB, returns empty object - metadata will be synced from picasa-ini by worker.
 */
export function getEntryMetadata(entry: AlbumEntry): AlbumEntryMetaData {
  const db = getWalkerDatabase();
  return db.getEntryMetadata(entry);
}

/**
 * Get shortcuts map (read-only operation)
 * Reads directly from the database.
 */
export function getShortcuts(): Shortcut[] {
  const db = getWalkerDatabase();
  return db.getShortcuts();
}

/**
 * Read shortcut for an album (read-only operation)
 * Reads directly from the database.
 */
export function readShortcut(album: Album): string | undefined {
  const db = getWalkerDatabase();
  return db.getAlbumShortcut(album.key);
}

/**
 * Read persons from entry metadata
 */
export function readPersons(entry: AlbumEntry): string[] {
  const metadata = getEntryMetadata(entry);
  const persons = metadata.persons || "";
  return persons.split(",").map((p) => p.trim());
}

/**
 * Get album metadata (read-only operation)
 * Reads directly from the database by reconstructing from entry metadata.
 */
export function getAlbumMetaData(album: Album): AlbumMetaData {
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
  getPicasaIdentifiedReferences,
  getAlbumPicasaContactByHash,
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
export async function getPicasaIdentifiedReferences(entry: AlbumEntry): Promise<Array<{ face: any; contact: Contact }>> {
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

