import { Album, AlbumEntry, AlbumEntryMetaData, AlbumKind, AlbumMetaData, AlbumWithData, ContactByHash, extraFields, ThumbnailSize } from "../../../shared/types/types";
import { getWalkerDatabase } from "./database";

// Re-export from picasa-ini for compatibility
export {
  cachedFilterKey,
  dimensionsFilterKey,
  rotateFilterKey,
  albumFromNameAndKind
} from "./picasa-ini";

/**
 * Walker Database Queries and Writes
 * 
 * This module provides access to the walker database.
 * Each function gets the database singleton and calls the appropriate method.
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
 * Write operations - can only be used by the walker worker
 */
export function upsertAlbum(album: AlbumWithData): void {
  const db = getWalkerDatabase();
  db.upsertAlbum(album);
}

export function deleteAlbum(albumKey: string): void {
  const db = getWalkerDatabase();
  db.deleteAlbum(albumKey);
}

export function replaceAlbumEntries(album: Album, entries: AlbumEntry[]): void {
  const db = getWalkerDatabase();
  db.replaceAlbumEntries(album, entries);
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
 * Get shortcuts map
 * Note: This needs to be implemented by reading from picasa-ini files or caching in worker
 */
export function getShortcuts(): { [shortcut: string]: Album } {
  // Shortcuts are managed in picasa-ini and cached in the worker
  // For now, return empty - this should be exposed via worker communication if needed
  // or read from a cache maintained by the worker
  return {};
}

/**
 * Read shortcut for an album
 */
export async function readShortcut(album: Album): Promise<string | undefined> {
  const { isMainThread } = await import("worker_threads");
  if (!isMainThread) {
    const picasaIni = await import("./picasa-ini");
    return await picasaIni.readShortcut(album);
  }
  // Main thread: would need to query worker or read from DB if we store shortcuts there
  // For now, return undefined if in main thread
  return undefined;
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
 * Get picasa entries for an album (internal - may need picasa-ini access)
 */
export async function getPicasaEntries(album: Album): Promise<AlbumEntry[]> {
  const { isMainThread } = await import("worker_threads");
  if (!isMainThread) {
    const picasaIni = await import("./picasa-ini");
    return await picasaIni.getPicasaEntries(album);
  }
  // Main thread: return entries from walker database
  return getAlbumEntries(album);
}

/**
 * Get album metadata (full picasa-ini structure)
 * Note: This should only be used when full metadata structure is needed
 */
export async function getAlbumMetaData(album: Album): Promise<AlbumMetaData> {
  const { isMainThread } = await import("worker_threads");
  if (!isMainThread) {
    const picasaIni = await import("./picasa-ini");
    return await picasaIni.getAlbumMetaData(album);
  }
  // Main thread: return empty for now - this requires picasa-ini access
  // In future, could reconstruct from database entries
  return {};
}

