import { readFile, writeFile } from "fs/promises";
import { join } from "path";
import {
  Album,
  AlbumEntry,
  FolderPixels,
  PicasaFolderMeta,
  ThumbnailSize,
} from "../../../shared/types/types";
import { imagesRoot } from "../../utils/constants";
import { readPicasaIni } from "../rpcFunctions/fs";
import {
  buildContext,
  encode,
  transform,
  execute,
  setOptions,
  destroyContext,
  commit,
} from "../rpcFunctions/sharp-processor";
import ini from "../../../shared/lib/ini";

let pixelsMap: Map<string, Promise<FolderPixels>> = new Map();
let dirtyPixelsMap: Map<string, FolderPixels> = new Map();

setInterval(async () => {
  const i = dirtyPixelsMap;
  dirtyPixelsMap = new Map();
  i.forEach(async (value, key) => {
    console.info(`Writing file ${join(imagesRoot, key, ".thumbnails.ini")}`);
    pixelsMap.delete(key);
    await writeFile(
      join(imagesRoot, key, ".thumbnails.ini"),
      ini.encode(value)
    );
  });
}, 10000);

async function getThumbnailIni(entry: Album): Promise<FolderPixels> {
  if (!pixelsMap.has(entry.key)) {
    pixelsMap.set(
      entry.key,
      readFile(join(imagesRoot, entry.key, ".thumbnails.ini"), {
        encoding: "utf8",
      }).then(ini.parse)
    );
  }
  return pixelsMap.get(entry.key)!;
}

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
  const pixels = await getThumbnailIni(entry.album).catch(
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

    // make dirty
    dirtyPixelsMap.set(entry.album.key, pixels);
  }
  return Buffer.from(pixels[entry.name][<any>size] as string, "base64");
}
