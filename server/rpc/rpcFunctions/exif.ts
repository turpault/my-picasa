import exifr from "exifr";
import { Stats } from "fs";
import { stat } from "fs/promises";
import { join } from "path";
import { isPicture, isVideo } from "../../../shared/lib/utils";
import { AlbumEntry, idFromKey } from "../../../shared/types/types";
import { imagesRoot } from "../../utils/constants";
import { entryFilePath } from "../../utils/serverUtils";
import { readPicasaEntry, updatePicasaEntry } from "./picasaIni";

export async function exifDataAndStats(
  entry: AlbumEntry
): Promise<{ stats: Stats; tags: any }> {
  const path = entryFilePath(entry);
  const [s, t] = await Promise.all([
    stat(path),
    exifData(entry),
  ]);
  const tags = t || {};

  return {
    stats: s,
    tags: { ...tags.image, ...tags.gps, ...tags.exif, ...tags },
  };
}

export function toExifDate(isoDate: string) {
  // exif is YYYY:MM:DD HH:MM:SS
  // iso is YYYY-MM-DDTHH:mm:ss.sssZ
  return `${isoDate.slice(0,4)}:${isoDate.slice(5,7)}:${isoDate.slice(8,10)} ${isoDate.slice(11,13)}:${isoDate.slice(14,16)}:${isoDate.slice(17,19)}`
}

export async function exifData(entry: AlbumEntry): Promise<any> {
  const picasaEntry = await readPicasaEntry(entry);
  if (isPicture(entry)) {
    if(picasaEntry.exif) {
      return JSON.parse(picasaEntry.exif);
    }
    const path = join(imagesRoot, idFromKey(entry.album.key).id, entry.name);
      console.info(`Read exif from ${path}`);
    const tags = await exifr
      .parse(entryFilePath(entry))
      .catch((e: any) => {
        console.error(`Exception while reading exif for ${path}: ${e}`);
        return {};
      });
    updatePicasaEntry(entry, "exif", JSON.stringify(tags || {}));
    const latitude = Array.isArray(tags.gps.latitude) &&  tags.gps.latitude[0] + tags.gps.latitude[1]/60 + tags.gps.latitude[2]/3600 || 0;
    const longitude = Array.isArray(tags.gps.longitude) && tags.gps.longitude[0] + tags.gps.longitude[1]/60 + tags.gps.longitude[2]/3600 || 0;

    updatePicasaEntry(entry, "latitude", latitude);
    updatePicasaEntry(entry, "longitude", longitude);

    if (!tags) {
      return {};
    }
    return tags;
  } else if (isVideo(entry)) {
    // no tags yet
    return {};
  }
  // Not a video or picture
  return {};
}
