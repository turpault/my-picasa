import {
  Album,
  AlbumEntry,
  AlbumInfo,
  videoExtensions,
} from "../shared/types/types.js";
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
    filter: "",
  };

  if (useSettings) {
    settings = getSettings();
  }
  // Gettings contents might change the picasa data
  const contents = await albumContents(album, settings.filter);
  const picasa = await readPicasaIni(album);
  let assets = contents.assets;

  // Add missing assets to the picasa contents
  for (const p of assets) {
    if (!picasa[p.name]) {
      picasa[p.name] = {};
    }
  }
  if (settings.filters.star) {
    assets = assets.filter((v) => {
      return !!picasa[v.name].star;
    });
  }
  if (settings.filters.video) {
    assets = assets.filter((v) =>
      videoExtensions.find((e) => v.name.toLowerCase().endsWith(e))
    );
  }
  assets.sort((a, b) => {
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
    assets.reverse();
  }
  return { picasa, assets };
}

export async function getFileExifData(entry: AlbumEntry): Promise<any> {
  const service = await getService();
  const exif = await service.exifData(entry);
  return exif;
}
