import { Stats } from "fs";
import { stat } from "fs/promises";
import { AlbumEntry } from "../../../shared/types/types";
import { entryFilePath } from "../../utils/serverUtils";
import { getExifData as getExifDataFromService, isExifProcessed } from "../../services/exif/queries";

export function toExifDate(isoDate: string) {
  // exif is YYYY:MM:DD HH:MM:SS
  // iso is YYYY-MM-DDTHH:mm:ss.sssZ
  return `${isoDate.slice(0, 4)}:${isoDate.slice(5, 7)}:${isoDate.slice(
    8,
    10,
  )} ${isoDate.slice(11, 13)}:${isoDate.slice(14, 16)}:${isoDate.slice(
    17,
    19,
  )}`;
}

/**
 * Get EXIF data for an entry from the EXIF service database
 * Returns null if the entry has not been processed yet
 * Returns an empty object {} if the entry has been processed but has no EXIF data
 * Returns the parsed EXIF data object if available
 */
export function getExifData(entry: AlbumEntry): any {
  // Check if the entry has been processed
  if (!isExifProcessed(entry)) {
    // Not processed yet - return null
    return null;
  }

  // Entry has been processed - get the data
  const exifJson = getExifDataFromService(entry);

  if (!exifJson || exifJson === "{}" || exifJson.trim() === "") {
    // Processed but no EXIF data - return empty object
    return {};
  }

  try {
    const exif = JSON.parse(exifJson);
    // If parsing results in an empty object, return it
    return exif;
  } catch (e) {
    // If parsing fails, return empty object
    return {};
  }
}

/**
 * Get file stats for an entry
 */
export async function getFileStats(entry: AlbumEntry): Promise<Stats> {
  const path = entryFilePath(entry);
  return stat(path);
}

export async function exifDataAndStats(
  entry: AlbumEntry,
): Promise<{ stats: Stats; tags: any }> {
  const [s, t] = await Promise.all([getFileStats(entry), getExifData(entry)]);
  const tags = t || {};

  return {
    stats: s,
    tags: { ...tags.image, ...tags.gps, ...tags.exif, ...tags },
  };
}
