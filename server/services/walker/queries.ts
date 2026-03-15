import { Album, AlbumEntry, AlbumEntryMetaData, AlbumMetaData, AlbumWithData, Contact, ContactByHash, extraFields, PicasaSection, Shortcut, ThumbnailSize } from "../../../shared/types/types";
import { createRPCClient } from "../../../shared/rpc-transport/create-rpc-client";
import { getWalkerDatabase } from "./internal/database";
import { getWorker } from "../../worker-manager";
import { WorkerAdaptor } from "../../../shared/rpc-transport/worker-adaptor";
import {
  WALKER_WORKER_METHODS,
  WALKER_WORKER_PARAM_NAMES,
  type WalkerWorkerClientApi,
} from "../../../shared/rpc-contracts";

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
 * Get mutations client (for write operations)
 * Returns a WalkerWorkerClient instance connected to the walker worker.
 * This is a singleton - the same instance is returned on each call.
 */
let mutationsClient: WalkerWorkerClientApi | null = null;

/**
 * Get mutations client if the walker worker is available.
 * Returns null when running in a worker thread (workers don't have access to other workers).
 */
export function getMutationsIfAvailable(): WalkerWorkerClientApi | null {
  if (mutationsClient) {
    return mutationsClient;
  }

  const worker = getWorker('walker');
  if (!worker) {
    return null;
  }

  const adaptor = new WorkerAdaptor(worker);
  mutationsClient = createRPCClient<WalkerWorkerClientApi>(
    adaptor,
    "WalkerWorkerClient",
    WALKER_WORKER_METHODS,
    WALKER_WORKER_PARAM_NAMES
  );
  return mutationsClient;
}

export function getMutations(): WalkerWorkerClientApi {
  const client = getMutationsIfAvailable();
  if (!client) {
    throw new Error("Walker worker not available");
  }
  return client;
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

