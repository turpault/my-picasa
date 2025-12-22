import { Album, AlbumEntry, AlbumWithData } from "../../../shared/types/types";
import { getWalkerDatabase } from "./database";

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

