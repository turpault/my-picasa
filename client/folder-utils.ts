import { Album, AlbumEntry, AlbumInfo } from "../shared/types/types.js";
import { readPicasaIni } from "./lib/handles.js";
import { getSettings, Settings } from "./lib/settings.js";
import { getService } from "./rpc/connect.js";
import { albumContents } from "./walker.js";

export async function getAlbumInfo(
  album: Album,
  useSettings: boolean = false
): Promise<AlbumInfo> {
  let settings: Settings = {
    sort: "date",
    filters: {
      star: false,
      video: false,
    },
    inverseSort: false,
  };

  if (useSettings) {
    settings = getSettings();
  }
  // Gettings contents might change the picasa data
  const contents = await albumContents(album);
  const picasa = await readPicasaIni(album);
  let pictures = contents.pictures;
  const videos = contents.videos;

  // Add missing pictures to the picasa contents
  for (const p of pictures) {
    if (!picasa[p.name]) {
      picasa[p.name] = {};
    }
  }
  if (settings.filters.star) {
    pictures = pictures.filter((v) => {
      if (!settings.filters.star || picasa[v.name].star) {
        return true;
      }
      return false;
    });
  }
  pictures.sort((a, b) => {
    if (settings.sort === "date") {
      const dateA = picasa[a.name].dateTaken;
      const dateB = picasa[b.name].dateTaken;
      if (!dateA) {
        return -1;
      }
      if (!dateB) {
        return 1;
      }
      return dateA < dateB ? -1 : dateA > dateB ? 1 : 0;
    } else if (settings.sort === "name") {
      return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
    }
    return 0;
  });
  if (settings.inverseSort) {
    pictures.reverse();
  }
  return { picasa, pictures, videos };
}

export async function getFileExifData(entry: AlbumEntry): Promise<any> {
  const service = await getService();
  const exif = await service.exifData(entry);
  return exif;
}
