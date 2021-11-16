import { copyFile, readFile, rename, unlink, writeFile } from "fs/promises";
import { join } from "path";
import { lock } from "../../../shared/lib/utils";
import {
  AlbumEntry,
  FolderPixels,
  ThumbnailSize,
  ThumbnailSizeVals,
} from "../../../shared/types/types";
import { imagesRoot } from "../../utils/constants";

let pixelsMap: Map<string, Promise<FolderPixels>> = new Map();
let dirtyPixelsMap: Map<string, FolderPixels> = new Map();

export async function deleteImageFileMetas(entry: AlbumEntry): Promise<void> {
  for (const k of ThumbnailSizeVals) {
    await deleteThumbnailFromCache(entry, k);
  }
}

export function fileFromEntryAndSize(entry: AlbumEntry, size: ThumbnailSize) {
  return join(imagesRoot, entry.album.key, `.${size}-${entry.name}`);
}

export async function readThumbnailFromCache(
  entry: AlbumEntry,
  size: ThumbnailSize
): Promise<Buffer | undefined> {
  const path = fileFromEntryAndSize(entry, size);
  const unlock = await lock(path);
  let d: Buffer | undefined;
  try {
    d = await readFile(path);
  } catch (e: any) {
    d = undefined;
  }
  unlock();
  return d;
}

export async function writeThumbnailToCache(
  entry: AlbumEntry,
  size: ThumbnailSize,
  data: Buffer
): Promise<void> {
  const path = fileFromEntryAndSize(entry, size);
  const unlock = await lock(path);
  let d: Buffer | undefined;
  try {
    const d = await writeFile(path, data);
  } catch (e: any) {
    d = undefined;
  }
  unlock();
}

export async function deleteThumbnailFromCache(
  entry: AlbumEntry,
  size: ThumbnailSize
): Promise<void> {
  const path = fileFromEntryAndSize(entry, size);
  const unlock = await lock(path);
  try {
    await unlink(path);
  } catch (e) {}
  unlock();
}

export async function copyThumbnails(
  entry: AlbumEntry,
  target: AlbumEntry,
  move: boolean
): Promise<void> {
  for (const size of ThumbnailSizeVals) {
    const source = fileFromEntryAndSize(entry, size);
    const dest = fileFromEntryAndSize(target, size);
    if (move) {
      await rename(source, dest);
    } else {
      await copyFile(source, dest);
    }
  }
}
