import { AlbumEntry } from "../../../shared/types/types";
import { getGeoPOI, getCoordinates } from "../../services/geolocate/queries";

/**
 * Get points of interest (POI) for an entry from the geolocate service
 */
export async function geoPOI(entry: AlbumEntry): Promise<string | null> {
  return getGeoPOI(entry);
}

/**
 * Get GPS coordinates (latitude, longitude) for an entry from EXIF data
 */
export async function getExifCoordinates(entry: AlbumEntry): Promise<{ latitude: number; longitude: number } | null> {
  return getCoordinates(entry);
}

