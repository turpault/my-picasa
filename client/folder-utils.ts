import ini from "../shared/lib/ini.js";
import {
  Folder,
  FolderEntry,
  FolderInfo,
  FolderPixels,
  PicasaFolderMeta,
  ThumbnailSize,
} from "../shared/types/types.js";
import { getFileContents } from "./lib/file.js";
import { Directory, File } from "./lib/handles.js";
import { getService } from "./rpc/connect.js";
import { folderContents } from "./walker.js";

const folderMap: Map<string, Promise<FolderInfo>> = new Map();
let dirtyPicasaMap: Map<Directory, PicasaFolderMeta> = new Map();

setInterval(async () => {
  const d = dirtyPicasaMap;
  dirtyPicasaMap = new Map();
  d.forEach(async (value, key) => {
    const iniHandleWrite = await key.getFileHandle(".picasa.ini");
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
      .then((handle: File) => getFileContents(handle))
      .then((data) => ini.decode(data as string) as PicasaFolderMeta)
      .catch(() => ({} as PicasaFolderMeta)),
  ]);
  if (!pictures || !videos) {
    const contents = await folderContents(fh);
    pictures = contents.pictures;
    videos = contents.videos;
  }

  const folder: Folder = {
    key: fh.path(),
    name: fh.name,
    handle: fh,
  };

  // Add missing pictures to the picasa contents
  for (const p of pictures) {
    if (!picasa[p.name]) {
      picasa[p.name] = {};
      dirtyPicasaMap.set(fh, picasa);
    }
  }
  return { ...folder, picasa, pictures, videos };
}

export async function updatePicasaData(
  fh: Directory,
  picasa: PicasaFolderMeta
) {
  const iniHandleWrite = await fh.getFileHandle(".picasa.ini");
  return iniHandleWrite.writeFileContents(ini.encode(picasa));
}

export async function getFileExifData(f: Folder, name: string): Promise<any> {
  const service = await getService();
  const exif = (await service.service.exifData(f.key + "/" + name)) as object;
  return exif;
}
