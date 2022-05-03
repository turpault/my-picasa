import { readFile, stat, writeFile } from "fs/promises";
import { extname } from "path";
import { Queue } from "../../../shared/lib/queue";
import { lock } from "../../../shared/lib/utils";
import {
  AlbumEntry,
  extraFields, ThumbnailSize,
  videoExtensions
} from "../../../shared/types/types";
import { dec, inc } from "../../utils/stats";
import {
  buildContext,
  commit,
  destroyContext,
  dimensionsFromFile,
  encode,
  execute,
  setOptions,
  transform
} from "../imageOperations/sharp-processor";
import { createGif } from "../videoOperations/gif";
import { readPicasaIni, updatePicasaEntry } from "./picasaIni";
import {
  readThumbnailFromCache,
  thumbnailPathFromEntryAndSize,
  writeThumbnailToCache
} from "./thumbnailCache";

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

async function readOrMakeImageThumbnail(
  entry: AlbumEntry,
  size: ThumbnailSize = "th-medium"
): Promise<{ width: number; height: number; data: Buffer; mime: string }> {
  const lockLabel = `readOrMakeImageThumbnail: ${entry.album.key}-${entry.name}-${size}`;
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

    const picasaLabel = cachedFilterKey[size];
    const picasaSizeLabel = dimensionsFilterKey[size];

    picasa[entry.name] = picasa[entry.name] || {};
    const transform = picasa[entry.name].filters || "";
    const cachedTransform = picasa[entry.name][picasaLabel];
    let cachedSize = picasa[entry.name][picasaSizeLabel];
    let jpegBuffer = await readThumbnailFromCache(entry, size);
    if (!jpegBuffer || !cachedSize || transform !== cachedTransform) {
      const res = await makeImageThumbnail(
        entry,
        picasa[entry.name],
        transform,
        [
          [
            "resize",
            sizes[size],
            undefined,
            { fit: "inside", kernel: "nearest" },
          ],
        ]
      );

      picasa[entry.name][picasaLabel] = transform;
      cachedSize = picasa[entry.name][
        picasaSizeLabel
      ] = `${res.width}x${res.height}`;
      updatePicasaEntry(entry, picasaLabel, picasa[entry.name][picasaLabel]);
      updatePicasaEntry(
        entry,
        picasaSizeLabel,
        picasa[entry.name][picasaSizeLabel]
      );

      writeThumbnailToCache(entry, size, res.data);
      jpegBuffer = res.data;
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

// Queue last-in first out
const thumbnailQueue = new Queue(4, { fifo: false });
async function makeImageThumbnail(
  entry: AlbumEntry,
  options: any | undefined,
  transformations: string | undefined,
  extraOperations: any[] | undefined
): Promise<{ width: number; height: number; data: Buffer; mime: string }> {
  return thumbnailQueue.add(async () => {
    const label = `Thumbnail for image ${entry.album.name} / ${
      entry.name
    } / ${transformations} / ${extraOperations ? extraOperations[0] : "no op"}`;
    console.time(label);
    try {
      const context = await buildContext(entry);
      if (options) {
        await setOptions(context, options);
      }
      if (extraOperations) {
        await execute(context, extraOperations);
        await commit(context);
      }
      if (transformations) {
        await transform(context, transformations);
      }
      const res = (await encode(context, "image/jpeg", "Buffer")) as {
        width: number;
        height: number;
        data: Buffer;
      };
      await destroyContext(context);
      console.timeEnd(label);
      return { ...res, mime: "image/jpeg" };
    } catch (e) {
      console.timeEnd(label);
      throw e;
    }
  });
}

export async function readOrMakeVideoThumbnail(
  entry: AlbumEntry,
  size: ThumbnailSize = "th-medium"
): Promise<{ data: Buffer; width: number; height: number; mime: string }> {
  let res: { data: Buffer; width: number; height: number } | undefined;
  const gif = thumbnailPathFromEntryAndSize(entry, size);
  if (!(await stat(gif).catch((e) => false))) {
    const unlock = await lock('readOrMakeVideoThumbnail: ' + entry.album.key + ' ' + entry.name + ' ' + size);
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
  } else {
    const data = await readFile(gif);
    const d = await dimensionsFromFile(gif);
    res = { data, ...d };
  }
  if (!res) {
    throw new Error("No result");
  } else {
    return { ...res, mime: "image/gif" };
  }
}
