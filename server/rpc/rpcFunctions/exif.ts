import exifr from "exifr";
import { Stats } from "fs";
import { stat } from "fs/promises";
import { join } from "path";
import { isPicture, isVideo } from "../../../shared/lib/utils";
import { AlbumEntry } from "../../../shared/types/types";
import { imagesRoot } from "../../utils/constants";

export async function exifDataAndStats(
  entry: AlbumEntry
): Promise<{ stats: Stats; tags: any }> {
  const path = join(imagesRoot, entry.album.key, entry.name);
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

export async function exifData(entry: AlbumEntry): Promise<any> {
  const path = join(imagesRoot, entry.album.key, entry.name);
  if (isPicture(entry)) {
    const tags = await exifr
      .parse(join(imagesRoot, entry.album.key, entry.name))
      .catch((e: any) => {
        console.error(`Exception while reading exif for ${path}: ${e}`);
        return {};
      });
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
