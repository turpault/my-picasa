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
  idFromKey,
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
  size: ThumbnailSize,
  animated: boolean
) {
  if (isVideo(entry))
    return {
      path: join(
        imagesRoot,
        idFromKey(entry.album.key).id,
        `.${size}-${entry.name}${animated?"":".non-animated"}.gif`
      ),
      mime: "image/gif",
    };
  else
    return {
      path: join(
        imagesRoot,
        idFromKey(entry.album.key).id,
        `.${size}-${entry.name}`
      ),
      mime: "image/jpeg",
    };
}

export async function readThumbnailFromCache(
  entry: AlbumEntry,
  size: ThumbnailSize,
  animated: boolean
): Promise<Buffer | undefined> {
  const { path } = thumbnailPathFromEntryAndSize(entry, size, animated);
  const unlock = await lock("readThumbnailFromCache: " + path);
  let d: Buffer | undefined;
  try {
    d = await readFile(path);
  } catch (e: any) {
    console.warn("Reading file from cache failed:", e);
    d = undefined;
  }
  unlock();
  return d;
}

export async function writeThumbnailToCache(
  entry: AlbumEntry,
  size: ThumbnailSize,
  data: Buffer,
  animated: boolean
): Promise<void> {
  const { path } = thumbnailPathFromEntryAndSize(entry, size, animated);
  const unlock = await lock("writeThumbnailToCache: " + path);
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
  for (const animated of [true, false]) {
    const { path } = thumbnailPathFromEntryAndSize(entry, size, animated);
    const unlock = await lock("deleteThumbnailFromCache: " + path);
    try {
      await unlink(path);
    } catch (e) {}
    unlock();
  }
}

export async function copyThumbnails(
  entry: AlbumEntry,
  target: AlbumEntry,
  move: boolean
): Promise<void> {
  for (const animated of [true, false]) {
    for (const size of ThumbnailSizeVals) {
      const { path: source } = thumbnailPathFromEntryAndSize(
        entry,
        size,
        animated
      );
      const { path: dest } = thumbnailPathFromEntryAndSize(
        target,
        size,
        animated
      );
      if (await fileExists(source)) {
        if (move) {
          await rename(source, dest);
        } else {
          await copyFile(source, dest);
        }
      }
    }
  }
}
