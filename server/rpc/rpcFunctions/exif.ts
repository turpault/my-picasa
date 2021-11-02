import * as ExifReader from "exifreader";
import { readFile } from "fs/promises";
import { join } from "path";
import { flattenObject } from "../../../shared/lib/utils";
import { imagesRoot } from "../../utils/constants";

export async function exifData(file: string): Promise<object> {
  const buf = await readFile(join(imagesRoot, file));
  const tags = ExifReader.load(buf);
  // decode raw exif data from a buffer
  return tags;
}
