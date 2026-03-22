import { copyFile, readFile, rename, stat, unlink } from "fs/promises";
import type { Stats } from "fs";
import { join } from "path";
import { lock } from "../../../shared/lib/mutex";
import { isVideo } from "../../../shared/lib/utils";
import {
  AlbumEntry,
  ThumbnailSize,
  ThumbnailSizeVals,
} from "../../../shared/types/types";
import { entryRelativePath } from "../../imageOperations/info";
import { imagesRoot } from "../../utils/constants";
import { fileExists, pathForAlbum, safeWriteFile } from "../../utils/serverUtils";
import { getEntryMetadata } from "../../services/walker/queries";

import Debug from "debug";
const debug = Debug("thumbnail");

export async function deleteImageFileMetas(entry: AlbumEntry): Promise<void> {
  for (const k of ThumbnailSizeVals) {
    await deleteThumbnailFromCache(entry, k);
  }
}

export function thumbnailPathFromEntryAndSize(
  entry: AlbumEntry,
  size: ThumbnailSize,
  animated: boolean,
) {
  const albumPath = join(imagesRoot, pathForAlbum(entry.album));
  if (isVideo(entry)) {
    const filename = `.${size}-${entry.name}${animated ? "" : ".non-animated"}.gif`;
    return {
      path: albumPath,
      fullPath: join(albumPath, filename),
      filename,
      mime: "image/gif",
    };
  } else {
    const filename = `.${size}-${entry.name}`;
    return {
      path: albumPath,
      fullPath: join(albumPath, filename),
      filename,
      mime: "image/jpeg",
    };
  }
}

export async function readThumbnailBufferFromCache(
  entry: AlbumEntry,
  size: ThumbnailSize,
  animated: boolean,
): Promise<Buffer | undefined> {
  const { fullPath } = thumbnailPathFromEntryAndSize(entry, size, animated);
  const unlock = await lock("readThumbnailBufferFromCache: " + fullPath);
  let d: Buffer | undefined;
  try {
    d = await readFile(fullPath);
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
  animated: boolean,
): Promise<void> {
  const { fullPath } = thumbnailPathFromEntryAndSize(entry, size, animated);
  const unlock = await lock("writeThumbnailToCache: " + fullPath);
  try {
    await safeWriteFile(fullPath, data);
  } catch (e: any) {
    console.warn("Writing file to cache failed:", e);
  } finally {
    unlock();
  }
}

export async function deleteThumbnailFromCache(
  entry: AlbumEntry,
  size: ThumbnailSize,
): Promise<void> {
  for (const animated of [true, false]) {
    const { fullPath } = thumbnailPathFromEntryAndSize(entry, size, animated);
    const unlock = await lock("deleteThumbnailFromCache: " + fullPath);
    try {
      await unlink(fullPath);
    } finally {
      unlock();
    }
  }
}
export async function updateThumbFilterVersion(
  entry: AlbumEntry,
  size: ThumbnailSize,
  filterVersion: number,
): Promise<void> {
  const db = (await import("../../services/entries/internal/database")).getEntriesDatabase();
  await db.updateThumbFilterVersion(entry, size, filterVersion);
}

export async function copyThumbnails(
  entry: AlbumEntry,
  target: AlbumEntry,
  move: boolean,
): Promise<void> {
  for (const animated of [true, false]) {
    for (const size of ThumbnailSizeVals) {
      const { fullPath: source } = thumbnailPathFromEntryAndSize(
        entry,
        size,
        animated,
      );
      const { fullPath: dest } = thumbnailPathFromEntryAndSize(
        target,
        size,
        animated,
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

function getThumbFilterVersionForSize(
  metadata: { thumbFilterVersionSmall?: number; thumbFilterVersionMedium?: number; thumbFilterVersionLarge?: number },
  size: ThumbnailSize,
): number {
  const v =
    size === "th-small"
      ? metadata.thumbFilterVersionSmall
      : size === "th-medium"
        ? metadata.thumbFilterVersionMedium
        : metadata.thumbFilterVersionLarge;
  return v ?? -1;
}

/** Second resolution avoids thrash on FAT/exFAT and sub-second mtime noise. */
function mtimeEpochSec(s: Stats): number {
  return Math.floor(s.mtimeMs / 1000);
}

export async function shouldMakeThumbnail(
  entry: AlbumEntry,
  size: ThumbnailSize,
  animated: boolean,
): Promise<boolean> {
  const { fullPath } = thumbnailPathFromEntryAndSize(entry, size, animated);
  // Never use memoStat here: it caches stat() forever, so after writing a thumbnail we would
  // keep seeing stale pre-write mtimes and regenerate in a loop.
  let thumbStats: Stats | undefined;
  try {
    thumbStats = await stat(fullPath);
  } catch {
    thumbStats = undefined;
  }

  if (!thumbStats) {
    debug(
      `Thumbnail for media ${entry.album.name}/${entry.name} does not exist (${fullPath})`,
    );
    return true;
  }
  if (thumbStats.size === 0) {
    debug(
      `Thumbnail for media ${entry.album.name}/${entry.name} has no size data`,
    );
    return true;
  }

  const metadata = await getEntryMetadata(entry);
  let sourceStat: Stats | undefined;
  try {
    sourceStat = await stat(join(imagesRoot, entryRelativePath(entry)));
  } catch {
    sourceStat = undefined;
  }

  if (!sourceStat) {
    return false;
  }

  const thumbSec = mtimeEpochSec(thumbStats);
  const sourceSec = mtimeEpochSec(sourceStat);
  if (thumbSec < sourceSec) {
    debug(
      `Thumbnail for media ${entry.album.name}/${entry.name} is outdated (source newer by ≥1s) thumb=${thumbStats.mtime.toISOString()} source=${sourceStat.mtime.toISOString()}`,
    );
    return true;
  }

  const filterVersion = metadata.filterVersion ?? 0;
  const thumbFilterVersion = getThumbFilterVersionForSize(metadata, size);
  if (thumbFilterVersion < filterVersion) {
    debug(
      `Thumbnail for media ${entry.album.name}/${entry.name} has stale filter version (${thumbFilterVersion} < ${filterVersion})`,
    );
    return true;
  }
  return false;
}
