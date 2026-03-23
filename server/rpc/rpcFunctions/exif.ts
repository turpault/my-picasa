import { Stats } from "fs";
import { AlbumEntry } from "../../../shared/types/types";
import { extractExifData } from "../../services/exif/internal/extract";
import { getExifData as getExifDataFromService, isExifProcessed } from "../../services/exif/queries";
import { entryFilePath, memoStat } from "../../utils/serverUtils";

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
 * Get EXIF data for an entry. Lazy, on-demand: extracts from file if not yet processed.
 * Returns null if the entry cannot be processed (e.g. not a picture)
 * Returns an empty object {} if processed but has no EXIF data
 * Returns the parsed EXIF data object if available
 */
export async function getExifData(entry: AlbumEntry): Promise<any> {
  if (!isExifProcessed(entry)) {
    await extractExifData(entry);
  }

  const exifJson = getExifDataFromService(entry);

  if (!exifJson || exifJson === "{}" || exifJson.trim() === "") {
    return {};
  }

  try {
    return JSON.parse(exifJson);
  } catch (e) {
    return {};
  }
}

/**
 * Get file stats for an entry
 */
export async function getFileStats(entry: AlbumEntry): Promise<Stats> {
  const path = entryFilePath(entry);
  return memoStat(path);
}
