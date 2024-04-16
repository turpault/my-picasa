import { mkdir, readFile, unlink } from "fs/promises";
import imageSize from "image-size";
import { extname, join } from "path";
import { lock } from "../../../shared/lib/mutex";
import { decodeRotate, isVideo } from "../../../shared/lib/utils";
import {
  AlbumEntry,
  AlbumKind,
  FaceData,
  ThumbnailSize,
  videoExtensions,
} from "../../../shared/types/types";
import {
  buildFaceImage,
  buildImage,
  dimensionsFromFileBuffer,
} from "../../imageOperations/sharp-processor";
import { ThumbnailSizes, facesFolder } from "../../utils/constants";
import {
  fileExists,
  removeExtension,
  safeWriteFile,
} from "../../utils/serverUtils";
import { dec, inc } from "../../utils/stats";
import { createGif } from "../../videoOperations/gif";
import { getFaceData } from "../albumTypes/faces";
import { makeProjectThumbnail } from "../albumTypes/projects";
import { readAlbumIni } from "./picasa-ini";
import {
  readThumbnailFromCache,
  shouldMakeThumbnail,
  thumbnailPathFromEntryAndSize,
  updateCacheData,
  writeThumbnailToCache,
} from "./thumbnail-cache";

export async function makeThumbnail(
  entry: AlbumEntry,
  size: ThumbnailSize = "th-medium",
  animated: boolean
): Promise<Buffer | void> {
  if (videoExtensions.includes(extname(entry.name).substr(1).toLowerCase())) {
    return makeVideoThumbnail(entry, size, animated);
  } else {
    return makeImageThumbnail(entry, size, animated);
  }
}

export async function readOrMakeThumbnail(
  entry: AlbumEntry,
  size: ThumbnailSize = "th-medium",
  animated: boolean = true
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

async function makeFaceThumbnail(entry: AlbumEntry) {
  const data = await getFaceImage(entry);
  const d = await dimensionsFromFileBuffer(data);
  return { data, ...d, mime: "image/jpeg" };
}
async function makeImageThumbnail(
  entry: AlbumEntry,
  size: ThumbnailSize,
  animated: boolean
): Promise<Buffer | undefined> {
  const lockLabel = `makeImageThumbnail: ${entry.album.key}-${entry.name}-${size}`;
  const release = await lock(lockLabel);
  inc("thumbnail");
  try {
    const picasa = await readAlbumIni(entry.album);

    picasa[entry.name] = picasa[entry.name] || {};
    const transform = picasa[entry.name].filters || "";
    const rotate = picasa[entry.name].rotate || "";

    if (!(await shouldMakeThumbnail(entry, size, animated))) {
      return undefined;
    }
    const res = await buildImage(entry, picasa[entry.name], transform, [
      [
        "resize",
        ThumbnailSizes[size],
        undefined,
        { fit: "inside", kernel: "nearest" },
      ],
    ]);

    updateCacheData(
      entry,
      transform,
      size,
      `${res.width}x${res.height}`,
      rotate
    );
    await writeThumbnailToCache(entry, size, res.data, animated);
    return res.data;
  } finally {
    dec("thumbnail");
    release();
  }
}

async function readOrMakeImageThumbnail(
  entry: AlbumEntry,
  size: ThumbnailSize,
  animated: boolean
): Promise<{ width: number; height: number; data: Buffer; mime: string }> {
  const lockLabel = `readOrMakeImageThumbnail: ${entry.album.key}-${entry.name}-${size}`;
  const release = await lock(lockLabel);
  inc("thumbnail");
  try {
    if (await shouldMakeThumbnail(entry, size, animated)) {
      await makeImageThumbnail(entry, size, animated);
    }
    let jpegBuffer = await readThumbnailFromCache(entry, size, animated);
    if (!jpegBuffer) {
      throw new Error("Cannot read thumbnail buffer");
    }
    const imgSize = imageSize(jpegBuffer);

    return {
      data: jpegBuffer,
      width: imgSize.width!,
      height: imgSize.height!,
      mime: "image/jpeg",
    };
  } finally {
    dec("thumbnail");
    release();
  }
}

async function makeVideoThumbnail(
  entry: AlbumEntry,
  size: ThumbnailSize = "th-medium",
  animated: boolean
): Promise<undefined | Buffer> {
  const { path } = thumbnailPathFromEntryAndSize(entry, size, animated);
  if (!(await shouldMakeThumbnail(entry, size, animated))) {
    return undefined;
  }

  const unlock = await lock(
    "makeVideoThumbnail: " +
      entry.album.key +
      " " +
      entry.name +
      " " +
      size +
      (animated ? " animated" : "")
  );
  try {
    const picasa = await readAlbumIni(entry.album);
    const transform = picasa[entry.name].filters || "";
    const rotate = picasa[entry.name].rotate || "";
    const data = await createGif(entry, ThumbnailSizes[size], animated, {
      rotate: decodeRotate(rotate),
      transform,
    });
    const imgSize = imageSize(data);
    await Promise.all([
      safeWriteFile(path, data),
      updateCacheData(
        entry,
        transform,
        size,
        `${imgSize.width!}x${imgSize.height!}`,
        rotate
      ),
    ]);
    return data;
  } finally {
    unlock();
  }
}

async function readOrMakeVideoThumbnail(
  entry: AlbumEntry,
  size: ThumbnailSize,
  animated: boolean
): Promise<{ data: Buffer; width: number; height: number; mime: string }> {
  let res: { data: Buffer; width: number; height: number } | undefined;
  const { path, mime } = thumbnailPathFromEntryAndSize(entry, size, animated);
  if (await shouldMakeThumbnail(entry, size, animated)) {
    const data = await makeVideoThumbnail(entry, size, animated);
    if (data) {
      const d = await dimensionsFromFileBuffer(data);
      res = { data, ...d };
    }
  } else {
    const data = await readFile(path);
    const d = await dimensionsFromFileBuffer(data);
    res = { data, ...d };
  }
  if (!res) {
    throw new Error("No result");
  } else {
    return { ...res, mime };
  }
}

function faceImagePath(
  entry: AlbumEntry,
  faceData: FaceData
): { folder: string; path: string } {
  const folder = join(
    facesFolder,
    "thumbnails",
    faceData.originalEntry.album.name
  );
  return {
    folder,
    path: join(
      folder,
      `${faceData.hash}-${faceData.rect}-${removeExtension(
        faceData.originalEntry.name
      )}.jpg`
    ),
  };
}
export async function getFaceImage(entry: AlbumEntry): Promise<Buffer>;
export async function getFaceImage(
  entry: AlbumEntry,
  onlyCheck: boolean
): Promise<void>;
export async function getFaceImage(
  entry: AlbumEntry,
  onlyCheck: boolean = false
): Promise<void | Buffer> {
  const faceData = await getFaceData(entry);
  const { folder, path } = faceImagePath(entry, faceData);
  const unlock = await lock(
    "getFaceImage: " + entry.album.key + " " + entry.name
  );
  try {
    if (!(await fileExists(path))) {
      await mkdir(folder, { recursive: true });

      const image = await buildFaceImage(entry, faceData);
      await safeWriteFile(path, image.data);
    }
    if (!onlyCheck) return await readFile(path);
  } finally {
    unlock();
  }
}

export async function deleteFaceImage(entry: AlbumEntry) {
  const faceData = await getFaceData(entry);
  const { path } = faceImagePath(entry, faceData);
  if (await fileExists(path)) {
    await unlink(path);
  }
}
