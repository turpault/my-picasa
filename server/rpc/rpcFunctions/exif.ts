import { Stats } from "fs";
import { stat } from "fs/promises";
import { AlbumEntry } from "../../../shared/types/types";
import { entryFilePath } from "../../utils/serverUtils";
import { getExifData } from "../../services/exif/queries";
import { getPicasaEntry } from "./picasa-ini";

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
 * Falls back to parsing from picasa entry if not in database
 */
export async function exifData(
  entry: AlbumEntry,
  withStats = true,
): Promise<any> {
  // Try to get from EXIF service database first
  const exifJson = getExifData(entry);
  let exif: any = null;

  if (exifJson) {
    try {
      exif = JSON.parse(exifJson);
    } catch (e) {
      // If parsing fails, continue to fallback
    }
  }

  // Fallback: try to get from picasa entry
  if (!exif) {
    const picasaEntry = await getPicasaEntry(entry);
    if (picasaEntry.exif) {
      try {
        exif = JSON.parse(picasaEntry.exif);
      } catch (e) {
        // If parsing fails, return empty object
        exif = {};
      }
    } else {
      exif = {};
    }
  }

  if (withStats) {
    const path = entryFilePath(entry);
    const stats = await stat(path);
    exif = { ...exif, ...stats };
  }

  return exif;
}

export async function exifDataAndStats(
  entry: AlbumEntry,
): Promise<{ stats: Stats; tags: any }> {
  const path = entryFilePath(entry);
  const [s, t] = await Promise.all([stat(path), exifData(entry)]);
  const tags = t || {};

  return {
    stats: s,
    tags: { ...tags.image, ...tags.gps, ...tags.exif, ...tags },
  };
}
