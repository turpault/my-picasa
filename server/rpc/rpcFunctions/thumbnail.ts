import { readFile, stat, writeFile } from "fs/promises";
import { extname } from "path";
import { lock } from "../../../shared/lib/utils";
import {
  AlbumEntry,
  extraFields,
  ThumbnailSize,
  videoExtensions,
} from "../../../shared/types/types";
import { dec, inc } from "../../utils/stats";
import {
  buildImage,
  dimensionsFromFile,
} from "../imageOperations/sharp-processor";
import { createGif } from "../videoOperations/gif";
import { readPicasaIni, updatePicasaEntry } from "./picasaIni";
import {
  readThumbnailFromCache,
  thumbnailPathFromEntryAndSize,
  writeThumbnailToCache,
} from "./thumbnailCache";

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

async function shouldMakeImageThumbnail(
  entry: AlbumEntry,
  size: ThumbnailSize
): Promise<boolean> {
  let exception: Error | undefined = undefined;
  try {
    const picasa = await readPicasaIni(entry.album);

    const picasaLabel = cachedFilterKey[size];
    const picasaSizeLabel = dimensionsFilterKey[size];

    picasa[entry.name] = picasa[entry.name] || {};
    const transform = picasa[entry.name].filters || "";
    const cachedTransform = picasa[entry.name][picasaLabel] || "";
    let cachedSize = picasa[entry.name][picasaSizeLabel];
    const path = thumbnailPathFromEntryAndSize(entry, size);
    const fileExists = stat(path)
      .then(() => true)
      .catch(() => false);
    if (!fileExists || !cachedSize || transform !== cachedTransform) {
      return true;
    }
    return false;
  } catch (e: any) {
    exception = e;
  } finally {
    if (exception) {
      throw exception;
    }
  }
  return false;
}

export async function makeThumbnail(
  entry: AlbumEntry,
  size: ThumbnailSize = "th-medium"
): Promise<void> {
  if (videoExtensions.includes(extname(entry.name).substr(1).toLowerCase())) {
    return makeVideoThumbnail(entry, size);
  } else {
    return makeImageThumbnail(entry, size);
  }
}

export async function readOrMakeThumbnail(
  entry: AlbumEntry,
  size: ThumbnailSize = "th-medium"
): Promise<{ width: number; height: number; data: Buffer; mime: string }> {
  if (videoExtensions.includes(extname(entry.name).substr(1).toLowerCase())) {
    return readOrMakeVideoThumbnail(entry, size);
  } else {
    return readOrMakeImageThumbnail(entry, size);
  }
}

async function makeImageThumbnail(
  entry: AlbumEntry,
  size: ThumbnailSize
): Promise<void> {
  const lockLabel = `makeImageThumbnail: ${entry.album.key}-${entry.name}-${size}`;
  const release = await lock(lockLabel);
  inc("thumbnail");
  let exception: Error | undefined = undefined;
  try {
    const picasa = await readPicasaIni(entry.album);
    const sizes = {
      "th-small": 100,
      "th-medium": 250,
      "th-large": 500,
    };

    const picasaLabel = cachedFilterKey[size];
    const picasaSizeLabel = dimensionsFilterKey[size];

    picasa[entry.name] = picasa[entry.name] || {};
    const transform = picasa[entry.name].filters || "";
    if (await shouldMakeImageThumbnail(entry, size)) {
      const res = await buildImage(entry, picasa[entry.name], transform, [
        [
          "resize",
          sizes[size],
          undefined,
          { fit: "inside", kernel: "nearest" },
        ],
      ]);

      picasa[entry.name][picasaLabel] = transform;
      picasa[entry.name][picasaSizeLabel] = `${res.width}x${res.height}`;
      updatePicasaEntry(entry, picasaLabel, picasa[entry.name][picasaLabel]);
      updatePicasaEntry(
        entry,
        picasaSizeLabel,
        picasa[entry.name][picasaSizeLabel]
      );

      writeThumbnailToCache(entry, size, res.data);
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
  size: ThumbnailSize = "th-medium"
): Promise<{ width: number; height: number; data: Buffer; mime: string }> {
  const lockLabel = `readOrMakeImageThumbnail: ${entry.album.key}-${entry.name}-${size}`;
  const release = await lock(lockLabel);
  inc("thumbnail");
  let exception: Error | undefined = undefined;
  try {
    if (await shouldMakeImageThumbnail(entry, size)) {
      await makeImageThumbnail(entry, size);
    }
    const picasaSizeLabel = dimensionsFilterKey[size];
    const picasa = await readPicasaIni(entry.album);
    let jpegBuffer = await readThumbnailFromCache(entry, size);
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
  size: ThumbnailSize = "th-medium"
): Promise<void> {
  let res: { data: Buffer; width: number; height: number } | undefined;
  const gif = thumbnailPathFromEntryAndSize(entry, size);
  if (!(await stat(gif).catch((e) => false))) {
    const unlock = await lock(
      "makeVideoThumbnail: " + entry.album.key + " " + entry.name + " " + size
    );
    let _exception;
    try {
      const sizes = {
        "th-small": 100,
        "th-medium": 250,
        "th-large": 500,
      };
      const data = await createGif(entry, sizes[size]);
      await writeFile(gif, data);
      const d = await dimensionsFromFile(gif);
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
  size: ThumbnailSize
): Promise<{ data: Buffer; width: number; height: number; mime: string }> {
  let res: { data: Buffer; width: number; height: number } | undefined;
  await makeVideoThumbnail(entry, size);
  const gif = thumbnailPathFromEntryAndSize(entry, size);
  const data = await readFile(gif);
  const d = await dimensionsFromFile(gif);
  res = { data, ...d };
  if (!res) {
    throw new Error("No result");
  } else {
    return { ...res, mime: "image/gif" };
  }
}
