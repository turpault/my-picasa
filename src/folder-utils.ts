import { readPictureWithTransforms } from "./imageProcess/client.js";
import exifreader from "./lib/exif/exifreader.js";
import { getFileContents } from "./lib/file.js";
import ini from "./lib/ini.js";
import Jimp from "./lib/jimp/jimp.js";
import { Folder, FolderInfo, ImageFolderMeta, PicasaFolderMeta, ThumbnailSize } from "./types/types.js";
import {folderContents} from './walker.js';

const folderMap: Map<
  string,
  Promise<{ picasa: PicasaFolderMeta; image: ImageFolderMeta }>
> = new Map();
let dirtyPicasaMap: Map<any, PicasaFolderMeta> = new Map();
let dirtyImageMap: Map<any, ImageFolderMeta> = new Map();

setInterval(async () => {
  const d = dirtyPicasaMap;
  dirtyPicasaMap = new Map();
  d.forEach(async (value, key) => {
    const iniHandleWrite = await key.getFileHandle(".picasa.ini", {
      create: true,
    });
    const writable = await iniHandleWrite.createWritable();
    const asIni = ini.encode(value);
    await writable.write(asIni);
    await writable.close();
  });
  const i = dirtyImageMap;
  dirtyImageMap = new Map();
  i.forEach(async (value, key) => {
    const iniHandleWrite = await key.getFileHandle(".thumbnails.ini", {
      create: true,
    });
    const writable = await iniHandleWrite.createWritable();
    const asIni = ini.encode(value);
    await writable.write(asIni);
    await writable.close();
  });
}, 10000);

export async function getFolderInfo(
  f: Folder
): Promise<FolderInfo> {
  if (!folderMap.has(f.key)) {
    folderMap.set(
      f.key,
      (async () => {
        try {
          const { picasa, image } = await getFolderInfoFromHandle(f.handle, f.pictures);
          return { picasa, image };
        } catch (e) {
          console.error("Cannot decode ini file: ", e);
          return { picasa: {}, image: {} };
        }
      })()
    );
  }
  return folderMap.get(f.key)!;
}

export async function getFolderInfoFromHandle(
  fh: any,
  pictures?: any[],
  videos?: any[]
): Promise<FolderInfo> {
  const [picasa, image] = await Promise.all([
    fh
      .getFileHandle(".picasa.ini")
      .then((handle: any) => getFileContents(handle, "string"))
      .then((data: string) => ini.decode(data) as PicasaFolderMeta)
      .catch(() => ({})),
    fh
      .getFileHandle(".thumbnails.ini")
      .then((handle: any) => getFileContents(handle, "string"))
      .then((data: string) => ini.decode(data) as ImageFolderMeta)
      .catch(() => ({})),
  ]);
  if(!pictures || !videos) {
    const contents = await folderContents(fh);
    pictures = contents.pictures;
    videos = contents.videos;
  }

  // Add missing pictures to the picasa contents
  for (const p of pictures) {
    if (!picasa[p.name]) {
      picasa[p.name] = {};
      dirtyPicasaMap.set(fh, picasa);
    }
    if (!image[p.name]) {
      image[p.name] = {};
      dirtyImageMap.set(fh, image);
    }
  }
  return { picasa, image };
}

export async function thumbnail(f: Folder, name: string, size:ThumbnailSize = "th-medium"): Promise<string> {
  const info = await getFolderInfo(f);
  const sizes = {
    "th-small": 50,
    "th-medium": 250,
    "th-large": 500
  };
  if (!info.image[name][<any>size]) {
    const img = await f.handle.getFileHandle(name);
    const image = await readPictureWithTransforms(img, info.picasa[name], [
      ["scaleToFit", sizes[size], sizes[size], Jimp.RESIZE_NEAREST_NEIGHBOR],
    ]);

    info.image[name][<any>size] = image;

    // make dirty
    dirtyImageMap.set(f.handle, info.image);
  }
  return info.image[name][<any>size] as string;
}

export async function getFileExifData(f: Folder, name: string): Promise<any> {
  const img = await f.handle.getFileHandle(name);
  const contents = await getFileContents(img, "buffer");
  return exifreader.load(contents);
}
