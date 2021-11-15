const exif = require("fast-exif");
import { stat } from "fs/promises";
import { join } from "path";
import { AlbumEntry } from "../../../shared/types/types";
import { imagesRoot } from "../../utils/constants";

export async function exifData(entry: AlbumEntry): Promise<any> {
  const path = join(imagesRoot, entry.album.key, entry.name);
  const [s, t] = await Promise.all([
    stat(path).catch((e) => {}),
    exif.read(join(imagesRoot, entry.album.key, entry.name)).catch((e: any) => {
      console.error(`Exception while reading exif for ${path}: ${e}`);
      return {};
    }),
  ]);
  const tags = t || {};

  return { stats: s, ...tags.image, ...tags.gps, ...tags.exif };
}
