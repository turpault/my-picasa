import { readFile, writeFile } from "fs/promises";
import { join } from "path";
import ini from "../../../shared/lib/ini";
import {
  Album, FolderPixels
} from "../../../shared/types/types";
import { imagesRoot, THUMBS } from "../../utils/constants";

let pixelsMap: Map<string, Promise<FolderPixels>> = new Map();
let dirtyPixelsMap: Map<string, FolderPixels> = new Map();

setInterval(async () => {
  const i = dirtyPixelsMap;
  dirtyPixelsMap = new Map();
  i.forEach(async (value, key) => {
    console.info(`Writing file ${join(imagesRoot, key, THUMBS)}`);
    pixelsMap.delete(key);
    await writeFile(
      join(imagesRoot, key, THUMBS),
      ini.encode(value)
    );
  });
}, 10000);

export async function readThumbnailIni(entry: Album): Promise<FolderPixels> {
  if (!pixelsMap.has(entry.key)) {
    pixelsMap.set(
      entry.key,
      readFile(join(imagesRoot, entry.key,THUMBS), {
        encoding: "utf8",
      }).then(ini.parse)
    );
  }
  return pixelsMap.get(entry.key)!;
}


export async function writeThumbnailIni(
  album: Album,
  data: FolderPixels
): Promise<void> {
  if (!dirtyPixelsMap.has(album.key)) {
    dirtyPixelsMap.set(album.key, data);
  }
}
