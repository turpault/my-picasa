import { Album, AlbumEntry, AlbumWithData, Filters } from "../../../shared/types/types";
import { getIndexingDatabaseReadOnly } from "./database";

/**
 * Search Database Queries (Read-Only)
 * 
 * This module provides read-only query access to the search database with FTS (Full-Text Search) capabilities.
 * The search service uses SQLite FTS5 for fast text search across album names, entry names, persons, text content, and captions.
 * Each function gets the read-only database singleton and calls the appropriate query method.
 * Does not use worker RPC - queries are executed directly against the database.
 */

/**
 * Search folders by Filters object (FTS function)
 */
export function searchFoldersByFilters(filters: Filters): AlbumWithData[] {
  const db = getIndexingDatabaseReadOnly();
  return db.searchFoldersByFilters(filters);
}

/**
 * Search pictures by Filters object (FTS function)
 */
export function searchPicturesByFilters(filters: Filters, limit?: number, albumId?: string): AlbumEntry[] {
  const db = getIndexingDatabaseReadOnly();
  return db.searchPicturesByFilters(filters, limit, albumId);
}

/**
 * Query AlbumEntry objects within a specific album by matching strings (FTS function)
 */
export function queryAlbumEntries(albumId: string, matchingStrings: string[]): AlbumEntry[] {
  const db = getIndexingDatabaseReadOnly();
  return db.queryAlbumEntries(albumId, matchingStrings);
}

/**
 * Get all entries for an album
 */
export function getAlbumEntries(album: Album): AlbumEntry[] {
  const db = getIndexingDatabaseReadOnly();
  return db.getAlbumEntries(album);
}

/**
 * Get all folders in the index
 */
export function getAllFolders(): AlbumWithData[] {
  const db = getIndexingDatabaseReadOnly();
  return db.getAllFolders();
}

/**
 * Get statistics about the index
 */
export function getStats(): { totalPictures: number; totalFolders: number; lastUpdated: string } {
  const db = getIndexingDatabaseReadOnly();
  return db.getStats();
}
