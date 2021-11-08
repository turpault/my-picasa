import * as ExifReader from "exifreader";
import { readFile } from "fs/promises";
import { join } from "path";
import { flattenObject } from "../../../shared/lib/utils";
import { AlbumEntry } from "../../../shared/types/types";
import { imagesRoot } from "../../utils/constants";

export async function exifData(entry: AlbumEntry): Promise<object> {
  const buf = await readFile(join(imagesRoot, entry.album.key, entry.name));
  const tags = ExifReader.load(buf);
  // decode raw exif data from a buffer
  return tags;
}
