import { AlbumEntry } from "../../../shared/types/types";
import { getExifData } from "../exif/queries";
import { getGeolocateDatabaseReadOnly } from "./database";
import { getLocations } from "./poi/get-poi";

/**
 * Geolocate Database Queries (Read-Only)
 * 
 * This module provides read-only query access to geolocation data.
 * Functions query the geolocate database for stored POI data.
 */

/**
 * Get GPS coordinates (latitude, longitude) from EXIF data for an entry
 */
export async function getCoordinates(entry: AlbumEntry): Promise<{ latitude: number; longitude: number } | null> {
  // Use the RPC function which handles processed/not processed distinction
  const { getExifData } = await import("../../rpc/rpcFunctions/exif");
  const exif = getExifData(entry);
  
  // If null, EXIF hasn't been processed yet
  if (exif === null) {
    return null;
  }

  // If empty object, EXIF was processed but has no data
  if (Object.keys(exif).length === 0) {
    return null;
  }

  try {
    const { GPSLatitude, GPSLatitudeRef, GPSLongitudeRef, GPSLongitude } = exif;

    if (
      GPSLatitude &&
      GPSLatitudeRef &&
      GPSLongitudeRef &&
      GPSLongitude
    ) {
      const latitude =
        (GPSLatitudeRef === "N" ? 1 : -1) *
        (GPSLatitude[0] + GPSLatitude[1] / 60 + GPSLatitude[2] / 3600);
      const longitude =
        (GPSLongitudeRef === "E" ? 1 : -1) *
        (GPSLongitude[0] + GPSLongitude[1] / 60 + GPSLongitude[2] / 3600);

      return { latitude, longitude };
    }
  } catch (e) {
    // If parsing fails, return null
  }

  return null;
}

/**
 * Get points of interest (POI) for an entry from the geolocate database
 */
export function getGeoPOI(entry: AlbumEntry): string | null {
  const db = getGeolocateDatabaseReadOnly();
  return db.getGeoPOI(entry);
}

