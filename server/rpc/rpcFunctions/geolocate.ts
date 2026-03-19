import { AlbumEntry } from "../../../shared/types/types";
import { getGeoPOI, getCoordinates } from "../../services/geolocate/queries";

/**
 * Get points of interest (POI) for an entry from the geolocate service
 */
export async function geoPOI(entry: AlbumEntry): Promise<string | null> {
  return getGeoPOI(entry);
}

/**
 * Get GPS coordinates (latitude, longitude) for an entry from exif_data table
 */
export function getExifCoordinates(entry: AlbumEntry): { latitude: number; longitude: number } | null {
  return getCoordinates(entry);
}

