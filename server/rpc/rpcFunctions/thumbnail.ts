import { mkdir, readFile, unlink } from "fs/promises";
import { join } from "path";
import { lock } from "../../../shared/lib/mutex";
import {
  decodeRotate,
  isPicture,
  isVideo,
  namify
} from "../../../shared/lib/utils";
import {
  AlbumEntry,
  AlbumKind,
  ThumbnailSize
} from "../../../shared/types/types";
import { exportToFolder } from "../../imageOperations/export";
import {
  buildFaceImage,
  dimensionsFromFileBuffer
} from "../../imageOperations/sharp-processor";
import { ThumbnailSizes, facesFolder } from "../../utils/constants";
import {
  fileExists,
  safeWriteFile
} from "../../utils/serverUtils";
import { dec, inc } from "../../utils/stats";
import { createGif } from "../../videoOperations/gif";
import { makeProjectThumbnail } from "../albumTypes/projects";
import { decodeReferenceId } from "../albumTypes/referenceFiles";
import { getPicasaEntry } from "./picasa-ini";
import {
  readThumbnailBufferFromCache,
  shouldMakeThumbnail,
  thumbnailPathFromEntryAndSize,
  updateCacheData,
  writeThumbnailToCache,
} from "./thumbnail-cache";

export async function readOrMakeThumbnail(
  entry: AlbumEntry,
  size: ThumbnailSize = "th-medium",
  animated: boolean = true,
): Promise<{ width: number; height: number; data: Buffer; mime: string }> {
  if (entry.album.kind == AlbumKind.FACE) {
    // Extract a face thumbnail
    return makeFaceThumbnail(entry);
  }
  if (entry.album.kind == AlbumKind.PROJECT) {
    return {
      width: 0,
      height: 0,
      data: await makeProjectThumbnail(entry, size),
      mime: "image/jpeg",
    };
  }
  if (isVideo(entry)) {
    return readOrMakeVideoThumbnail(entry, size, animated);
  } else {
    return readOrMakeImageThumbnail(entry, size, animated);
  }
}

export async function makeThumbnailIfNeeded(
  entry: AlbumEntry,
  size: ThumbnailSize = "th-medium",
  animated: boolean = true,
) {
  try {
    if (isPicture(entry)) {
      return await makeImageThumbnailIfNeeded(entry, size, animated);
    } else {
      return await makeVideoThumbnailIfNeeded(entry, size, animated);
    }
  } catch (e) {
    console.error(
      `Error making thumbnail for ${entry.album.key}/${entry.name}: ${e}`,
    );
  }
}

async function makeFaceThumbnail(entry: AlbumEntry) {
  const data = await getFaceImage(entry.name);
  const d = await dimensionsFromFileBuffer(data);
  return { data, ...d, mime: "image/jpeg" };
}
async function makeImageThumbnail(
  entry: AlbumEntry,
  size: ThumbnailSize,
  animated: boolean,
): Promise<string | undefined> {
  const lockLabel = `makeImageThumbnail: ${entry.album.key}-${entry.name}-${size}`;
  const release = await lock(lockLabel);
  inc("thumbnail");
  try {
    const picasaEntry = await getPicasaEntry(entry);

    const transform = picasaEntry.filters || "";
    const rotate = picasaEntry.rotate || "";
    const { path, filename } = thumbnailPathFromEntryAndSize(entry, size, animated);

    const thumbpath = await exportToFolder(entry, path, { label: false, filename, resize: ThumbnailSizes[size], filters: transform, overwrite: true });


    updateCacheData(
      entry,
      transform,
      size,
      `${ThumbnailSizes[size]}`,
      rotate,
    );
    return thumbpath;
  } finally {
    dec("thumbnail");
    release();
  }
}

async function makeImageThumbnailIfNeeded(
  entry: AlbumEntry,
  size: ThumbnailSize,
  animated: boolean,
) {
  inc("thumbnail");
  try {
    if (await shouldMakeThumbnail(entry, size, animated)) {
      await makeImageThumbnail(entry, size, animated);
    }
  } finally {
    dec("thumbnail");
  }
}

async function readOrMakeImageThumbnail(
  entry: AlbumEntry,
  size: ThumbnailSize,
  animated: boolean,
): Promise<{ width: number; height: number; data: Buffer; mime: string }> {
  await makeImageThumbnailIfNeeded(entry, size, animated);
  let jpegBuffer = await readThumbnailBufferFromCache(entry, size, animated);
  if (!jpegBuffer) {
    throw new Error("Cannot read thumbnail buffer");
  }
  const imgSize = dimensionsFromFileBuffer(jpegBuffer);

  return {
    data: jpegBuffer,
    width: imgSize.width!,
    height: imgSize.height!,
    mime: "image/jpeg",
  };
}

async function makeVideoThumbnail(
  entry: AlbumEntry,
  size: ThumbnailSize = "th-medium",
  animated: boolean,
): Promise<undefined | Buffer> {
  const picasa = await getPicasaEntry(entry);
  const transform = picasa.filters || "";
  const rotate = picasa.rotate || "";
  const data = await createGif(entry, ThumbnailSizes[size], animated, {
    rotate: decodeRotate(rotate),
    transform,
  });
  const imgSize = dimensionsFromFileBuffer(data);
  await writeThumbnailToCache(entry, size, data, animated);

  await Promise.all([
    updateCacheData(
      entry,
      transform,
      size,
      `${imgSize.width!}x${imgSize.height!}`,
      rotate,
    ),
  ]);
  return data;
}

async function makeVideoThumbnailIfNeeded(
  entry: AlbumEntry,
  size: ThumbnailSize,
  animated: boolean,
) {
  inc("thumbnail");
  const unlock = await lock(
    "makeVideoThumbnailIfNeeded: " +
    entry.album.key +
    " " +
    entry.name +
    " " +
    size +
    (animated ? " animated" : ""),
  );
  try {
    if (await shouldMakeThumbnail(entry, size, animated)) {
      await makeVideoThumbnail(entry, size, animated);
    }
  } finally {
    dec("thumbnail");
    unlock();
  }
}

async function readOrMakeVideoThumbnail(
  entry: AlbumEntry,
  size: ThumbnailSize,
  animated: boolean,
): Promise<{ data: Buffer; width: number; height: number; mime: string }> {
  let res: { data: Buffer; width: number; height: number } | undefined;
  await makeVideoThumbnailIfNeeded(entry, size, animated);
  const { fullPath, mime } = thumbnailPathFromEntryAndSize(entry, size, animated);
  const data = await readFile(fullPath);
  const d = await dimensionsFromFileBuffer(data);
  return { data, ...d, mime };
}

function faceImagePath(referenceId: string): { folder: string; path: string } {
  const { entry: originalEntry, index } = decodeReferenceId(referenceId);
  const folder = join(facesFolder, "thumbnails", originalEntry.album.name);

  return {
    folder,
    path: join(
      folder,
      `${namify(originalEntry.album.name + originalEntry.name)}-${index}.jpg`,
    ),
  };
}

export async function getFaceImage(referenceId: string): Promise<Buffer>;
export async function getFaceImage(
  referenceId: string,
  onlyCheck: boolean,
): Promise<void>;
export async function getFaceImage(
  referenceId: string,
  onlyCheck: boolean = false,
): Promise<void | Buffer> {
  const { folder, path } = faceImagePath(referenceId);
  const unlock = await lock("getFaceImage: " + referenceId);
  try {
    if (!(await fileExists(path))) {
      await mkdir(folder, { recursive: true });

      const image = await buildFaceImage(referenceId);
      await safeWriteFile(path, image.data);
      return image.data;
    }
    if (!onlyCheck) {
      return await readFile(path);
    }
  } catch (e) {
    console.error(`Error getting face image for ${referenceId}: ${e}`);
    return;
  } finally {
    unlock();
  }
}

export async function deleteFaceImage(entry: AlbumEntry) {
  const { path } = faceImagePath(entry.name);
  if (await fileExists(path)) {
    await unlink(path);
  }
}
