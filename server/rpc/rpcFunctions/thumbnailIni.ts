import { readFile, writeFile } from "fs/promises";
import { join } from "path";
import ini from "../../../shared/lib/ini";
import { sleep } from "../../../shared/lib/utils";
import {
  Album,
  AlbumEntry,
  FolderPixels,
  ImageFileMeta,
  ImageFileMetas,
  ThumbnailSize,
  ThumbnailSizeVals,
} from "../../../shared/types/types";
import { imagesRoot, THUMBS } from "../../utils/constants";
import { rate } from "../../utils/stats";

let pixelsMap: Map<string, Promise<FolderPixels>> = new Map();
let dirtyPixelsMap: Map<string, FolderPixels> = new Map();

(async () => {
  while (true) {
    const i = dirtyPixelsMap;
    dirtyPixelsMap = new Map();
    for (const [key, value] of i.entries()) {
      rate('writeThumbnailIni');
      console.info(
        `Writing file ${join(imagesRoot, key, THUMBS)}: file has ${
          Object.keys(value).length
        } entries`
      );
      pixelsMap.delete(key);
      await writeFile(join(imagesRoot, key, THUMBS), ini.encode(value));
    }
    await sleep(1);
  }
})();

export async function readThumbnailIni(entry: Album): Promise<FolderPixels> {
  if (dirtyPixelsMap.has(entry.key)) {
    return dirtyPixelsMap.get(entry.key)!;
  }
  if (!pixelsMap.has(entry.key)) {
    rate('readThumbnailIni');
    pixelsMap.set(
      entry.key,
      readFile(join(imagesRoot, entry.key, THUMBS), {
        encoding: "utf8",
      })
        .then(ini.parse)
        .catch((e) => {
          console.warn(e);
          return {};
        })
    );
  }
  return pixelsMap.get(entry.key)!;
}

export async function writeThumbnailIni(
  album: Album,
  data: FolderPixels
): Promise<void> {
  dirtyPixelsMap.set(album.key, data);
}

function iniFieldName(name: string, size: string) {
  return name + ":" + size;
}

export async function readImageFileMetas(
  entry: AlbumEntry
): Promise<ImageFileMetas> {
  const metas: ImageFileMetas = {} as any;
  for (const k of ThumbnailSizeVals) {
    const val = await readThumbnailFromIni(entry, k);
    if (val) {
      metas[k] = val;
    }
  }
  return metas;
}

export async function writeImageFileMetas(
  entry: AlbumEntry,
  metas: ImageFileMetas
): Promise<ImageFileMetas> {
  for (const k of ThumbnailSizeVals) {
    if (metas[k]) {
      await writeThumbnailInIni(entry, k, metas[k]);
    }
  }
  return metas;
}

export async function deleteImageFileMetas(entry: AlbumEntry): Promise<void> {
  for (const k of ThumbnailSizeVals) {
    await deleteThumbnailInIni(entry, k);
  }
}

export async function readThumbnailFromIni(
  entry: AlbumEntry,
  size: ThumbnailSize
): Promise<ImageFileMeta | undefined> {
  const pixels = await readThumbnailIni(entry.album).catch((e) => {
    console.warn(e);
    debugger;
    return {} as FolderPixels;
  });
  return pixels[iniFieldName(entry.name, size)] as ImageFileMeta;
}

export async function writeThumbnailInIni(
  entry: AlbumEntry,
  size: ThumbnailSize,
  data: ImageFileMeta
): Promise<void> {
  const pixels = await readThumbnailIni(entry.album).catch((e) => {
    console.warn(e);
    return {} as FolderPixels;
  });
  pixels[iniFieldName(entry.name, size)] = data;
  return writeThumbnailIni(entry.album, pixels);
}

export async function deleteThumbnailInIni(
  entry: AlbumEntry,
  size: ThumbnailSize
): Promise<void> {
  const pixels = await readThumbnailIni(entry.album).catch((e) => {
    console.warn(e);
    return {} as FolderPixels;
  });
  delete pixels[iniFieldName(entry.name, size)];
}
