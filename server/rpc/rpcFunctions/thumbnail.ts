import { lock } from "../../../shared/lib/utils";
import {
  AlbumEntry,
  extraFields,
  PartialRecord,
  PicasaFolderMeta,
  ThumbnailSize,
  ThumbnailSizeVals,
} from "../../../shared/types/types";
import { dec, inc } from "../../utils/stats";
import {
  buildContext,
  commit,
  destroyContext,
  encode,
  execute,
  setOptions,
  transform,
} from "../imageOperations/sharp-processor";
import { readPicasaIni, updatePicasaEntry } from "./picasaIni";
import {
  readThumbnailFromCache,
  writeThumbnailToCache,
} from "./thumbnailCache";

export async function readOrMakeThumbnail(
  entry: AlbumEntry,
  size: ThumbnailSize = "th-medium"
): Promise<{ width: number; height: number; data: Buffer }> {
  const lockLabel = `thumbnail:${entry.album.key}-${entry.name}-${size}`;
  const release = await lock(lockLabel);
  inc("thumbnail");
  let exception: Error | undefined = undefined;
  try {
    const picasa = await readPicasaIni(entry.album).catch(
      () => ({} as PicasaFolderMeta)
    );
    const sizes = {
      "th-small": 100,
      "th-medium": 250,
      "th-large": 500,
    };
    const cachedFilterKey:Record<ThumbnailSize,extraFields> =  {
      "th-small": "cached:filters:th-small",
      "th-medium": "cached:filters:th-medium",
      "th-large": "cached:filters:th-large",
    };
    const dimensionsFilterKey:Record<ThumbnailSize,extraFields> =  {
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
    if (!jpegBuffer || !cachedTransform || !cachedSize || transform !== cachedTransform ) {
      const res = await makeThumbnail(entry, picasa[entry.name], transform, [
        [
          "resize",
          sizes[size],
          undefined,
          { fit: "inside", kernel: "nearest" },
        ],
      ]);

      picasa[entry.name][picasaLabel] = transform;
      cachedSize = picasa[entry.name][picasaSizeLabel] = `${res.width}x${res.height}`;
      updatePicasaEntry(entry, picasaLabel, picasa[entry.name][picasaLabel]);
      updatePicasaEntry(entry, picasaSizeLabel, picasa[entry.name][picasaSizeLabel]);

      writeThumbnailToCache(entry, size, res.data);
      jpegBuffer = res.data;
    }
    const [width, height] = cachedSize.split('x').map(parseInt);
    return {data: jpegBuffer, width, height};
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

async function makeThumbnail(
  entry: AlbumEntry,
  options: any | undefined,
  transformations: string | undefined,
  extraOperations: any[] | undefined
): Promise<{ width: number; height: number; data: Buffer }> {
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
  return res;
}
