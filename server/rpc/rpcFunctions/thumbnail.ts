import { lock } from "../../../shared/lib/utils";
import {
  AlbumEntry,
  PicasaFolderMeta,
  ThumbnailSize,
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
  readThumbnailFromIni as readThumbnailFromCache,
  writeThumbnailInIni as writeThumbnailToCache,
} from "./thumbnailCache";

export async function readOrMakeThumbnail(
  entry: AlbumEntry,
  size: ThumbnailSize = "th-medium"
): Promise<{ width: number; height: number; data: string }> {
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
    const picasaLabel = "cached:filters:" + size;

    picasa[entry.name] = picasa[entry.name] || {};
    const transform = picasa[entry.name].filters || "";
    const cachedTransform = picasa[entry.name][picasaLabel];
    let jpegBuffer = await readThumbnailFromCache(entry, size);
    if (!jpegBuffer || transform !== cachedTransform.transform) {
      const res = await makeThumbnail(entry, picasa[entry.name], transform, [
        [
          "resize",
          sizes[size],
          undefined,
          { fit: "inside", kernel: "nearest" },
        ],
      ]);

      picasa[entry.name][picasaLabel] = transform;
      updatePicasaEntry(entry, picasaLabel, transform);

      writeThumbnailToCache(entry, size, pix);
    }
    return pix!;
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
