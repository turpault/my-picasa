import { readFile, writeFile } from "fs/promises";
import { join } from "path";
import ini from "../../../shared/lib/ini";
import {
  FolderPixels,
  PicasaFolderMeta,
  ThumbnailSize,
} from "../../../shared/types/types";
import { imagesRoot } from "../../utils/constants";
import {
  buildContext,
  encode,
  transform,
  execute,
  setOptions,
  destroyContext,
} from "../rpcFunctions/sharp-processor";

let pixelsMap: Map<string, Promise<FolderPixels>> = new Map();
let dirtyPixelsMap: Map<string, FolderPixels> = new Map();
let picasaMap: Map<string, Promise<PicasaFolderMeta>> = new Map();

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
  picasaMap.clear();
}, 10000);

async function getThumbnailIni(folder: string): Promise<FolderPixels> {
  if (!pixelsMap.has(folder)) {
    pixelsMap.set(
      folder,
      readFile(join(imagesRoot, folder, ".thumbnails.ini"), {
        encoding: "utf8",
      }).then(ini.parse)
    );
  }
  return pixelsMap.get(folder)!;
}

async function getPicasalIni(folder: string): Promise<PicasaFolderMeta> {
  if (!picasaMap.has(folder)) {
    picasaMap.set(
      folder,
      await readFile(join(imagesRoot, folder, ".picasa.ini"), {
        encoding: "utf8",
      }).then(ini.parse)
    );
  }
  return picasaMap.get(folder)!;
}

async function makeThumbnail(
  fh: string,
  options: any | undefined,
  transformations: string | undefined,
  extraOperations: any[] | undefined
): Promise<string> {
  const context = await buildContext(fh);
  if (options) {
    await setOptions(context, options);
  }
  if (transformations) {
    await transform(context, transformations);
  }
  if (extraOperations) {
    await execute(context, extraOperations);
  }
  const asBase64 = (await encode(context, "image/jpeg", "base64")) as string;
  await destroyContext(context);
  return asBase64;
}

export async function thumbnail(
  f: string,
  name: string,
  size: ThumbnailSize = "th-medium"
): Promise<Buffer> {
  const picasa = await getPicasalIni(f).catch(() => ({} as PicasaFolderMeta));
  const pixels = await getThumbnailIni(f).catch(() => ({} as FolderPixels));
  const sizes = {
    "th-small": 100,
    "th-medium": 250,
    "th-large": 500,
  };

  picasa[name] = picasa[name] || {};
  pixels[name] = pixels[name] || {};
  const transform = picasa[name].filters || "";
  const transformRef = "transform-" + size;
  if (
    !pixels[name][<any>size] ||
    pixels[name][<any>transformRef] !== transform
  ) {
    const image = await makeThumbnail(join(f, name), picasa[name], transform, [
      ["resize", sizes[size], sizes[size], { fit: "cover" }],
    ]);

    pixels[name][<any>size] = image;
    pixels[name][<any>transformRef] = transform;

    // make dirty
    dirtyPixelsMap.set(f, pixels);
  }
  return Buffer.from(pixels[name][<any>size] as string, "base64");
}
