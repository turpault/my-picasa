import { readFile, stat, writeFile } from "fs/promises";
import { extname, join } from "path";
import { isVideo, lock } from "../../../shared/lib/utils";
import {
  AlbumEntry,
  AlbumKind,
  extraFields,
  ThumbnailSize,
  ThumbnailSizeVals,
  videoExtensions,
} from "../../../shared/types/types";
import { ThumbnailSizes, imagesRoot } from "../../utils/constants";
import { dec, inc } from "../../utils/stats";
import { entryRelativePath } from "../imageOperations/info";
import {
  buildFaceImage,
  buildImage,
  dimensionsFromFile,
} from "../imageOperations/sharp-processor";
import { createGif } from "../videoOperations/gif";
import { readAlbumIni, updatePicasaEntries } from "./picasaIni";
import {
  readThumbnailFromCache,
  thumbnailPathFromEntryAndSize,
  writeThumbnailToCache,
} from "./thumbnailCache";
import { makeProjectThumbnail } from "../projects";
import { safeWriteFile } from "../../utils/serverUtils";

const cachedFilterKey: Record<ThumbnailSize, extraFields> = {
  "th-small": "cached:filters:th-small",
  "th-medium": "cached:filters:th-medium",
  "th-large": "cached:filters:th-large",
};
const dimensionsFilterKey: Record<ThumbnailSize, extraFields> = {
  "th-small": "cached:dimensions:th-small",
  "th-medium": "cached:dimensions:th-medium",
  "th-large": "cached:dimensions:th-large",
};

export async function shouldMakeImageThumbnail(
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

  const picasaLabel = cachedFilterKey[size];
  const picasaSizeLabel = dimensionsFilterKey[size];

  picasa[entry.name] = picasa[entry.name] || {};
  const transform = picasa[entry.name].filters || "";
  const cachedTransform = picasa[entry.name][picasaLabel] || "";
  let cachedSize = picasa[entry.name][picasaSizeLabel];
  const { path } = thumbnailPathFromEntryAndSize(entry, size, animated);
  const fileExistsAndIsNotOutdated = await stat(path)
    .then((s) => s.size !== 0 && s.mtime > sourceStat.mtime)
    .catch(() => false);
  if (
    !fileExistsAndIsNotOutdated ||
    !cachedSize ||
    transform !== cachedTransform
  ) {
    return true;
  }
  return false;
}

export async function makeThumbnail(
  entry: AlbumEntry,
  size: ThumbnailSize = "th-medium",
  animated: boolean
): Promise<void> {
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
  return buildFaceImage(entry);
}
async function makeImageThumbnail(
  entry: AlbumEntry,
  size: ThumbnailSize,
  animated: boolean
): Promise<void> {
  const lockLabel = `makeImageThumbnail: ${entry.album.key}-${entry.name}-${size}`;
  const release = await lock(lockLabel);
  inc("thumbnail");
  let exception: Error | undefined = undefined;
  try {
    const picasa = await readAlbumIni(entry.album);
    const picasaLabel = cachedFilterKey[size];
    const picasaSizeLabel = dimensionsFilterKey[size];

    picasa[entry.name] = picasa[entry.name] || {};
    const transform = picasa[entry.name].filters || "";
    if (await shouldMakeImageThumbnail(entry, size, animated)) {
      const res = await buildImage(entry, picasa[entry.name], transform, [
        [
          "resize",
          ThumbnailSizes[size],
          undefined,
          { fit: "inside", kernel: "nearest" },
        ],
      ]);

      updatePicasaEntries(entry, {
        [picasaLabel]: transform,
        [picasaSizeLabel]: `${res.width}x${res.height}`,
      });

      await writeThumbnailToCache(entry, size, res.data, animated);
    }
  } catch (e: any) {
    exception = e;
  } finally {
    dec("thumbnail");
    release();
    if (exception) {
      throw exception;
    }
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
  let exception: Error | undefined = undefined;
  try {
    if (await shouldMakeImageThumbnail(entry, size, animated)) {
      await makeImageThumbnail(entry, size, animated);
    }
    const picasaSizeLabel = dimensionsFilterKey[size];
    const picasa = await readAlbumIni(entry.album);
    let jpegBuffer = await readThumbnailFromCache(entry, size, animated);
    let cachedSize = picasa[entry.name][picasaSizeLabel];
    if (!cachedSize) {
      throw new Error("Cannot read cached size");
    }
    if (!jpegBuffer) {
      throw new Error("Cannot read thumbnail buffer");
    }
    const [width, height] = cachedSize.split("x").map(parseInt);
    return { data: jpegBuffer, width, height, mime: "image/jpeg" };
  } catch (e: any) {
    exception = e;
  } finally {
    dec("thumbnail");
    release();
    if (exception) {
      throw exception;
    }
  }
  throw new Error("bad locking");
}

async function makeVideoThumbnail(
  entry: AlbumEntry,
  size: ThumbnailSize = "th-medium",
  animated: boolean
): Promise<void> {
  let res: { data: Buffer; width: number; height: number } | undefined;
  const { path } = thumbnailPathFromEntryAndSize(entry, size, animated);
  if (!(await stat(path).catch((e) => false))) {
    const unlock = await lock(
      "makeVideoThumbnail: " +
        entry.album.key +
        " " +
        entry.name +
        " " +
        size +
        (animated ? " animated" : "")
    );
    let _exception;
    try {
      const data = await createGif(entry, ThumbnailSizes[size], animated);
      await safeWriteFile(path, data);
      const d = await dimensionsFromFile(path);
      res = { data, ...d };
    } catch (e) {
      _exception = e;
    } finally {
      unlock();
      if (_exception) {
        throw _exception;
      }
    }
  }
}

async function readOrMakeVideoThumbnail(
  entry: AlbumEntry,
  size: ThumbnailSize,
  animated: boolean
): Promise<{ data: Buffer; width: number; height: number; mime: string }> {
  let res: { data: Buffer; width: number; height: number } | undefined;
  await makeVideoThumbnail(entry, size, animated);
  const { path, mime } = thumbnailPathFromEntryAndSize(entry, size, animated);
  const data = await readFile(path);
  const d = await dimensionsFromFile(path);
  res = { data, ...d };
  if (!res) {
    throw new Error("No result");
  } else {
    return { ...res, mime };
  }
}
