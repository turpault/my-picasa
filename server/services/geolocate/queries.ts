import { AlbumEntry } from "../../../shared/types/types";
import { getGeolocateDatabaseReadOnly } from "./database";

/**
 * Geolocate Database Queries (Read-Only)
 * 
 * This module provides read-only query access to geolocation data.
 * Each function gets the read-only database singleton and calls the appropriate query method.
 * Does not use worker RPC - queries are executed directly against the database.
 */

/**
 * Get points of interest (POI) for an entry from the geolocate database
 */
export function getGeoPOI(entry: AlbumEntry): string | null {
  const db = getGeolocateDatabaseReadOnly();
  return db.getGeoPOI(entry);
}

/**
 * Check if an entry has geo POI data
 */
export function hasGeoPOI(entry: AlbumEntry): boolean {
  const db = getGeolocateDatabaseReadOnly();
  return db.hasGeoPOI(entry);
}

/**
 * Check if an entry has been processed (regardless of whether it has geo POI data)
 */
export function isProcessed(entry: AlbumEntry): boolean {
  const db = getGeolocateDatabaseReadOnly();
  return db.isProcessed(entry);
}

/**
 * Get GPS coordinates (latitude, longitude) from EXIF data for an entry
 */
export function getCoordinates(entry: AlbumEntry): { latitude: number; longitude: number } | null {
  const db = getGeolocateDatabaseReadOnly();
  return db.getCoordinates(entry);
}

