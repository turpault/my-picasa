import ini from "../shared/lib/ini.js";
import {
  Album,
  AlbumEntry,
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
let dirtyPicasaMap: Map<string, PicasaFolderMeta> = new Map();

setInterval(async () => {
  const d = dirtyPicasaMap;
  dirtyPicasaMap = new Map();
  d.forEach(async (value, key) => {
    const iniHandleWrite = await Directory.from(key).getFileHandle(
      ".picasa.ini"
    );
    await iniHandleWrite.writeFileContents(ini.encode(value));
  });
}, 10000);

export async function getFolderInfo(f: Album): Promise<FolderInfo> {
  if (!folderMap.has(f.key)) {
    folderMap.set(
      f.key,
      (async () => {
        try {
          const folderInfo = await getFolderInfoFromHandle(f);
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
  album: Album,
  pictures?: AlbumEntry[],
  videos?: AlbumEntry[]
): Promise<FolderInfo> {
  const d = Directory.from(album.key);
  const picasa = await getFileContents(d.getFileHandle(".picasa.ini"))
    .then((data) => ini.decode(data as string) as PicasaFolderMeta)
    .catch(() => ({} as PicasaFolderMeta));

  if (!pictures || !videos) {
    const contents = await folderContents(album);
    pictures = contents.pictures.map((name) => ({ album, name }));
    videos = contents.videos.map((name) => ({ album, name }));
  }

  // Add missing pictures to the picasa contents
  for (const p of pictures) {
    if (!picasa[p.name]) {
      picasa[p.name] = {};
      dirtyPicasaMap.set(album.key, picasa);
    }
  }
  return { picasa, pictures, videos };
}

export async function updatePicasaData(fh: string, picasa: PicasaFolderMeta) {
  const iniHandleWrite = Directory.from(fh).getFileHandle(".picasa.ini");
  return iniHandleWrite.writeFileContents(ini.encode(picasa));
}

export async function getFileExifData(f: Album, name: string): Promise<any> {
  const service = await getService();
  const exif = (await service.exifData(f.key + "/" + name)) as object;
  return exif;
}
