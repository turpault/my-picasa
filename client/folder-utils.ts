import ini from "../shared/lib/ini.js";
import { readPictureWithTransforms } from "./imageProcess/client.js";
import exifreader from "./lib/exif/exifreader.js";
import { getFileContents } from "./lib/file.js";
import { Directory, File } from "./lib/handles.js";
import Jimp from "./lib/jimp/jimp.js";
import {
  Folder,
  FolderEntry,
  FolderInfo,
  FolderPixels,
  PicasaFolderMeta,
  ThumbnailSize,
} from "../shared/types/types.js";
import { folderContents } from "./walker.js";

const folderMap: Map<string, Promise<FolderInfo>> = new Map();
let dirtyPicasaMap: Map<Directory, PicasaFolderMeta> = new Map();
let dirtyPixelsMap: Map<Directory, FolderPixels> = new Map();

setInterval(async () => {
  const d = dirtyPicasaMap;
  dirtyPicasaMap = new Map();
  d.forEach(async (value, key) => {
    const iniHandleWrite = await key.getFileHandle(".picasa.ini");
    await iniHandleWrite.writeFileContents(ini.encode(value));
  });
  const i = dirtyPixelsMap;
  dirtyPixelsMap = new Map();
  i.forEach(async (value, key) => {
    const iniHandleWrite = await key.getFileHandle(".thumbnails.ini");
    await iniHandleWrite.writeFileContents(ini.encode(value));
  });
}, 10000);

export async function getFolderInfo(f: Folder): Promise<FolderInfo> {
  if (!folderMap.has(f.key)) {
    folderMap.set(
      f.key,
      (async () => {
        try {
          const folderInfo = await getFolderInfoFromHandle(f.handle);
          return folderInfo;
        } catch (e) {
          console.error("Cannot decode ini file: ", e);
          return { ...f, pictures: [], videos: [], picasa: {}, pixels: {} };
        }
      })()
    );
  }
  return folderMap.get(f.key)!;
}

export async function getFolderInfoFromHandle(
  fh: Directory,
  pictures?: FolderEntry[],
  videos?: FolderEntry[]
): Promise<FolderInfo> {
  const [picasa, pixels] = await Promise.all([
    fh
      .getFileHandle(".picasa.ini")
      .then((handle: File) => getFileContents(handle, "string"))
      .then((data) => ini.decode(data as string) as PicasaFolderMeta)
      .catch(() => ({} as PicasaFolderMeta)),
    fh
      .getFileHandle(".thumbnails.ini")
      .then((handle: any) => getFileContents(handle, "string"))
      .then((data) => ini.decode(data as string) as FolderPixels)
      .catch(() => ({} as FolderPixels)),
  ]);
  if (!pictures || !videos) {
    const contents = await folderContents(fh);
    pictures = contents.pictures;
    videos = contents.videos;
  }

  const folder: Folder = {
    key: fh.name,
    name: fh.name,
    handle: fh,
  };

  // Add missing pictures to the picasa contents
  for (const p of pictures) {
    if (!picasa[p.name]) {
      picasa[p.name] = {};
      dirtyPicasaMap.set(fh, picasa);
    }
    if (!pixels[p.name]) {
      pixels[p.name] = {};
      dirtyPixelsMap.set(fh, pixels);
    }
  }
  return { ...folder, picasa, pixels, pictures, videos };
}

export async function updatePicasaData(
  fh: Directory,
  picasa: PicasaFolderMeta
) {
  const iniHandleWrite = await fh.getFileHandle(".picasa.ini");
  return iniHandleWrite.writeFileContents(ini.encode(picasa));
}

export async function thumbnail(
  f: Folder,
  name: string,
  size: ThumbnailSize = "th-medium"
): Promise<string> {
  const info = await getFolderInfo(f);
  const sizes = {
    "th-small": 100,
    "th-medium": 250,
    "th-large": 500,
  };
  const transform = info.picasa[name].filters || "";
  const transformRef = "transform-" + size;
  if (
    !info.pixels[name][<any>size] ||
    info.pixels[name][<any>transformRef] !== transform
  ) {
    const img = await f.handle.getFileHandle(name);
    const image = await readPictureWithTransforms(
      img,
      info.picasa[name],
      transform,
      [["scaleToFit", sizes[size], sizes[size], Jimp.RESIZE_NEAREST_NEIGHBOR]]
    );

    info.pixels[name][<any>size] = image;
    info.pixels[name][<any>transformRef] = transform;

    // make dirty
    dirtyPixelsMap.set(f.handle, info.pixels);
  }
  return info.pixels[name][<any>size] as string;
}

export async function getFileExifData(f: Folder, name: string): Promise<any> {
  const img = await f.handle.getFileHandle(name);
  const contents = await getFileContents(img, "buffer");
  return exifreader.load(contents);
}
