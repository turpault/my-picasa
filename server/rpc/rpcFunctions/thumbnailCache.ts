import {
  copyFile,
  readFile,
  rename,
  stat,
  unlink,
  writeFile,
} from "fs/promises";
import { join } from "path";
import { isVideo, lock } from "../../../shared/lib/utils";
import {
  AlbumEntry,
  ThumbnailSize,
  ThumbnailSizeVals,
} from "../../../shared/types/types";
import { imagesRoot } from "../../utils/constants";
import { fileExists } from "../../utils/serverUtils";

export async function deleteImageFileMetas(entry: AlbumEntry): Promise<void> {
  for (const k of ThumbnailSizeVals) {
    await deleteThumbnailFromCache(entry, k);
  }
}

export function thumbnailPathFromEntryAndSize(
  entry: AlbumEntry,
  size: ThumbnailSize
) {
  if (isVideo(entry))
    return join(imagesRoot, entry.album.key, `.${size}-${entry.name}.gif`);
  else return join(imagesRoot, entry.album.key, `.${size}-${entry.name}`);
}

export async function readThumbnailFromCache(
  entry: AlbumEntry,
  size: ThumbnailSize
): Promise<Buffer | undefined> {
  const path = thumbnailPathFromEntryAndSize(entry, size);
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
  const path = thumbnailPathFromEntryAndSize(entry, size);
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
  const path = thumbnailPathFromEntryAndSize(entry, size);
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
    const source = thumbnailPathFromEntryAndSize(entry, size);
    const dest = thumbnailPathFromEntryAndSize(target, size);
    if (await fileExists(source)) {
      if (move) {
        await rename(source, dest);
      } else {
        await copyFile(source, dest);
      }
    }
  }
}
