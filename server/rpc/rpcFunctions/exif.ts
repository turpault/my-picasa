const exif = require("fast-exif");
import { Stats } from "fs";
import { stat } from "fs/promises";
import { join } from "path";
import { AlbumEntry } from "../../../shared/types/types.js";
import { imagesRoot } from "../../utils/constants.js";

export async function exifDataAndStats(
  entry: AlbumEntry
): Promise<{ stats: Stats | void; tags: any }> {
  const path = join(imagesRoot, entry.album.key, entry.name);
  const [s, t] = await Promise.all([
    stat(path).catch((e) => {}),
    exifData(entry),
  ]);
  const tags = t || {};

  return { stats: s, tags: { ...tags.image, ...tags.gps, ...tags.exif } };
}

export async function exifData(entry: AlbumEntry): Promise<any> {
  const path = join(imagesRoot, entry.album.key, entry.name);
  const tags = await exif
    .read(join(imagesRoot, entry.album.key, entry.name))
    .catch((e: any) => {
      console.error(`Exception while reading exif for ${path}: ${e}`);
      return {};
    });
  if (!tags) {
    return {};
  }

  return { ...tags.image, ...tags.gps, ...tags.exif };
}
