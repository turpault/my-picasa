import { AlbumEntry } from "../../../shared/types/types";
import { getExifDatabaseReadOnly } from "./database";

/**
 * EXIF Database Queries (Read-Only)
 * 
 * This module provides read-only query access to the EXIF database.
 * Each function gets the read-only database singleton and calls the appropriate query method.
 * Does not use worker RPC - queries are executed directly against the database.
 */

/**
 * Get EXIF data for a specific entry
 */
export function getExifData(entry: AlbumEntry): string | null {
  const db = getExifDatabaseReadOnly();
  return db.getExifData(entry);
}

/**
 * Check if an entry has EXIF data
 */
export function hasExifData(entry: AlbumEntry): boolean {
  const db = getExifDatabaseReadOnly();
  return db.hasExifData(entry);
}

/**
 * Check if an entry has been processed (regardless of whether it has EXIF data)
 */
export function isExifProcessed(entry: AlbumEntry): boolean {
  const db = getExifDatabaseReadOnly();
  return db.isProcessed(entry);
}

/**
 * Get statistics about the EXIF database
 */
export function getStats(): { totalEntries: number; processedEntries: number; unprocessedEntries: number; lastProcessed: string } {
  const db = getExifDatabaseReadOnly();
  return db.getStats();
}

