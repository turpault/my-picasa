import { Album, AlbumEntry, AlbumEntryMetaData, AlbumMetaData, AlbumWithData, Contact, ContactByHash, extraFields, PicasaSection, Shortcut, ThumbnailSize } from "../../../shared/types/types";
import { getWalkerDatabase } from "./internal/database";
import { getWorker } from "../../worker-manager";
import { WorkerAdaptor } from "../../../shared/rpc-transport/worker-adaptor";
import { WalkerWorkerClient } from "../../../client/rpc/generated-rpc/WalkerWorkerClient";

// Re-export from picasa-ini for compatibility
export {
  cachedFilterKey,
  dimensionsFilterKey,
  rotateFilterKey,
  albumFromName,
  albumFromNameAndKind
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
 * Get mutations client (for write operations)
 * Returns a WalkerWorkerClient instance connected to the walker worker.
 * This is a singleton - the same instance is returned on each call.
 */
let mutationsClient: WalkerWorkerClient | null = null;

export function getMutations(): WalkerWorkerClient {
  if (mutationsClient) {
    return mutationsClient;
  }

  const worker = getWorker('walker');
  if (!worker) {
    throw new Error("Walker worker not available");
  }

  const adaptor = new WorkerAdaptor(worker);
  mutationsClient = new WalkerWorkerClient();
  mutationsClient.initialize(adaptor);
  return mutationsClient;
}

/**
 * Get contacts from an album (read-only operation)
 * Reads from picasa-ini files via internal walker functions.
 * Note: This is a read operation that can be safely called from main thread.
 */
export async function getContactsFromAlbum(album: Album): Promise<ContactByHash> {
  // Import dynamically to avoid circular dependencies
  const { getContactsFromAlbum: getContacts } = await import("./internal/picasa-ini");
  return await getContacts(album);
}

/**
 * Get contact by hash from an album (read-only operation)
 * Reads from picasa-ini files via internal walker functions.
 */
export async function getContactByHash(album: Album, hash: string): Promise<Contact> {
  // Import dynamically to avoid circular dependencies
  const { getContactByHash: getContact } = await import("./internal/picasa-ini");
  return await getContact(album, hash);
}

/**
 * Get a Picasa section from album metadata (read-only operation)
 * Reads from picasa-ini files via internal walker functions.
 */
export async function getPicasaSection(album: Album, section: string): Promise<PicasaSection> {
  // Import dynamically to avoid circular dependencies
  const { getPicasaSection: getSection } = await import("./internal/picasa-ini");
  return await getSection(album, section);
}
