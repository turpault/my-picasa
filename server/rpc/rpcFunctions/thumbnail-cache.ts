import { copyFile, readFile, rename, stat, unlink } from "fs/promises";
import { join } from "path";
import { lock } from "../../../shared/lib/mutex";
import { decodeRotate, isPicture, isVideo } from "../../../shared/lib/utils";
import {
  AlbumEntry,
  ThumbnailSize,
  ThumbnailSizeVals,
  idFromKey,
} from "../../../shared/types/types";
import { entryRelativePath } from "../../imageOperations/info";
import { imagesRoot } from "../../utils/constants";
import { fileExists, safeWriteFile } from "../../utils/serverUtils";
import {
  cachedFilterKey,
  dimensionsFilterKey,
  readAlbumIni,
  rotateFilterKey,
  updatePicasaEntries,
} from "./picasa-ini";

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
        `.${size}-${entry.name}${animated ? "" : ".non-animated"}.gif`
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
  try {
    await safeWriteFile(path, data);
  } catch (e: any) {
    console.warn("Writing file to cache failed:", e);
  } finally {
    unlock();
  }
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
    } finally {
      unlock();
    }
  }
}
export async function updateCacheData(
  entry: AlbumEntry,
  transform: string,
  size: ThumbnailSize,
  dimensions: string,
  rotate: string
) {
  const picasaFilterLabel = cachedFilterKey[size];
  const picasaSizeLabel = dimensionsFilterKey[size];
  const picasaRotateLabel = rotateFilterKey[size];

  updatePicasaEntries(entry, {
    [picasaFilterLabel]: transform,
    [picasaSizeLabel]: dimensions,
    [picasaRotateLabel]: rotate,
  });
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

export async function shouldMakeThumbnail(
  entry: AlbumEntry,
  size: ThumbnailSize,
  animated: boolean
): Promise<boolean> {
  const picasa = await readAlbumIni(entry.album);
  const sourceStat = await stat(
    join(imagesRoot, entryRelativePath(entry))
  ).catch(() => undefined);

  if (!sourceStat) {
    // Source file is gone
    return false;
  }
  const picasaFilterLabel = cachedFilterKey[size];
  const picasaSizeLabel = dimensionsFilterKey[size];
  const picasaRotateLabel = rotateFilterKey[size];
  const cachedTransform = picasa[entry.name][picasaFilterLabel] || "";
  const cachedSize = picasa[entry.name][picasaSizeLabel];
  const cachedRotate = decodeRotate(picasa[entry.name][picasaRotateLabel]);

  picasa[entry.name] = picasa[entry.name] || {};
  const transform = picasa[entry.name].filters || "";
  const rotate = decodeRotate(picasa[entry.name].rotate);
  const { path } = thumbnailPathFromEntryAndSize(entry, size, animated);
  const fileExistsAndIsNotOutdated = await stat(path)
    .then((s) => s.size !== 0 && s.mtime > sourceStat.mtime)
    .catch(() => false);
  if (
    !fileExistsAndIsNotOutdated ||
    (cachedSize === undefined && isPicture(entry)) ||
    transform !== cachedTransform ||
    rotate !== cachedRotate
  ) {
    return true;
  }
  return false;
}
