import {
  AlbumEntry,
  FolderPixels,
  PicasaFolderMeta,
  ThumbnailSize
} from "../../../shared/types/types";
import { readPicasaIni } from "../rpcFunctions/picasaIni";
import {
  buildContext, commit, destroyContext, encode, execute,
  setOptions, transform
} from "../rpcFunctions/sharp-processor";
import { readThumbnailIni, writeThumbnailIni } from "../rpcFunctions/thumbnailInit";

async function makeThumbnail(
  entry: AlbumEntry,
  options: any | undefined,
  transformations: string | undefined,
  extraOperations: any[] | undefined
): Promise<string> {
  const context = await buildContext(entry);
  if (options) {
    await setOptions(context, options);
  }
  if (transformations) {
    await transform(context, transformations);
  }
  if (extraOperations) {
    await commit(context);
    await execute(context, extraOperations);
  }
  const asBase64 = (await encode(context, "image/jpeg", "base64")) as string;
  await destroyContext(context);
  return asBase64;
}

export async function thumbnail(
  entry: AlbumEntry,
  size: ThumbnailSize = "th-medium"
): Promise<Buffer> {
  const picasa = await readPicasaIni(entry.album).catch(
    () => ({} as PicasaFolderMeta)
  );
  const pixels = await readThumbnailIni(entry.album).catch(
    () => ({} as FolderPixels)
  );
  const sizes = {
    "th-small": 100,
    "th-medium": 250,
    "th-large": 500,
  };

  picasa[entry.name] = picasa[entry.name] || {};
  pixels[entry.name] = pixels[entry.name] || {};
  const transform = picasa[entry.name].filters || "";
  const transformRef = "transform-" + size;
  if (
    !pixels[entry.name][<any>size] ||
    pixels[entry.name][<any>transformRef] !== transform
  ) {
    const image = await makeThumbnail(entry, picasa[entry.name], transform, [
      ["resize", sizes[size], undefined, { fit: "inside", kernel: "nearest" }],
    ]);

    pixels[entry.name][<any>size] = image;
    pixels[entry.name][<any>transformRef] = transform;

    writeThumbnailIni(entry.album, pixels);
  }
  return Buffer.from(pixels[entry.name][<any>size] as string, "base64");
}
