import { lock } from "../../../shared/lib/utils";
import {
  AlbumEntry,
  PicasaFolderMeta,
  ThumbnailSize,
} from "../../../shared/types/types";
import {
  buildContext,
  commit,
  destroyContext,
  encode,
  execute,
  setOptions,
  transform,
} from "../imageOperations/sharp-processor";
import { readPicasaIni } from "./picasaIni";
import { readThumbnailFromIni, writeThumbnailInIni } from "./thumbnailIni";

export async function readOrMakeThumbnail(
  entry: AlbumEntry,
  size: ThumbnailSize = "th-medium"
): Promise<{ width: number; height: number; data: string }> {
  const lockLabel = `thumbnail:${entry.album.key}-${entry.name}-${size}`;
  const release = await lock(lockLabel);
  let exception: Error | undefined = undefined;
  try {
    const picasa = await readPicasaIni(entry.album).catch(
      () => ({} as PicasaFolderMeta)
    );
    let pix = await readThumbnailFromIni(entry, size);
    const sizes = {
      "th-small": 100,
      "th-medium": 250,
      "th-large": 500,
    };

    picasa[entry.name] = picasa[entry.name] || {};
    const transform = picasa[entry.name].filters || "";
    if (!pix || pix.transform !== transform) {
      const res = await makeThumbnail(entry, picasa[entry.name], transform, [
        [
          "resize",
          sizes[size],
          undefined,
          { fit: "inside", kernel: "nearest" },
        ],
      ]);

      pix = { ...res, transform };

      writeThumbnailInIni(entry, size, pix);
    }
    return pix!;
  } catch (e: any) {
    exception = e;
  } finally {
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
): Promise<{ width: number; height: number; data: string }> {
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
  const res = (await encode(context, "image/jpeg", "base64urlInfo")) as {
    width: number;
    height: number;
    data: string;
  };
  await destroyContext(context);
  return res;
}
