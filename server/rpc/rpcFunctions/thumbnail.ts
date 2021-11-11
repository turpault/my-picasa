import { lock, release } from "../../../shared/lib/utils";
import {
  AlbumEntry,
  FolderPixels,
  ImageFileMeta,
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
} from "../rpcFunctions/sharp-processor";
import { readPicasaIni } from "./picasaIni";
import { readThumbnailIni, writeThumbnailIni } from "./thumbnailIni";

function n(name: string, size: string) {
  return name + ":" + size;
}

export async function readOrMakeThumbnail(
  entry: AlbumEntry,
  size: ThumbnailSize = "th-medium"
): Promise<{ width: number; height: number; data: string }> {
  const lockLabel = `thumbnail:${entry.album.key}-${entry.name}-${size}`;
  await lock(lockLabel);
  let exception: Error | undefined = undefined;
  try {
    const picasa = await readPicasaIni(entry.album).catch(
      () => ({} as PicasaFolderMeta)
    );
    const pixels = await readThumbnailIni(entry.album).catch((e) => {
      console.warn(e);
      debugger;
      return {} as FolderPixels;
    });
    const sizes = {
      "th-small": 100,
      "th-medium": 250,
      "th-large": 500,
    };

    picasa[entry.name] = picasa[entry.name] || {};
    const transform = picasa[entry.name].filters || "";
    const e = n(entry.name, size);
    const pix = pixels[e] as ImageFileMeta;
    if (!pix || pix.transform !== transform) {
      const res = await makeThumbnail(entry, picasa[entry.name], transform, [
        [
          "resize",
          sizes[size],
          undefined,
          { fit: "inside", kernel: "nearest" },
        ],
      ]);

      pixels[e] = { ...res, transform };

      writeThumbnailIni(entry.album, pixels);
    }
    return pixels[e]!;
  } catch (e: any) {
    exception = e;
  } finally {
    await release(lockLabel);
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
