import { Album, AlbumEntry, AlbumInfo } from "../shared/types/types.js";
import { readPicasaIni } from "./lib/handles.js";
import { getService } from "./rpc/connect.js";
import { folderContents } from "./walker.js";

export async function getAlbumInfo(album: Album): Promise<AlbumInfo> {
  const picasa = await readPicasaIni(album);

  const contents = await folderContents(album);
  const pictures = contents.pictures.map((name) => ({ album, name }));
  const videos = contents.videos.map((name) => ({ album, name }));

  // Add missing pictures to the picasa contents
  for (const p of pictures) {
    if (!picasa[p.name]) {
      picasa[p.name] = {};
    }
  }
  return { picasa, pictures, videos };
}

export async function getFileExifData(entry: AlbumEntry): Promise<any> {
  const service = await getService();
  const exif = await service.exifData(entry);
  return exif;
}
