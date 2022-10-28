import {
  Album,
  AlbumEntry,
  AlbumEntryPicasa,
  AlbumInfo,
  videoExtensions,
} from "../shared/types/types";
import { readPicasaIni } from "./lib/handles";
import { getSettings, Settings } from "./lib/settings";
import { getService } from "./rpc/connect";
import { albumContents } from "./walker";

export async function buildAlbumEntryEx(
  entries: AlbumEntry[]
): Promise<AlbumEntryPicasa[]> {
  const uniqueAlbums = entries.reduce((prev, val) => {
    if (!prev.find((a) => a.key === val.album.key)) {
      prev.push(val.album);
    }
    return prev;
  }, [] as Album[]);
  const s = await getService();
  const picasa = await Promise.all(
    uniqueAlbums.map(async (a) => {
      const pic = await s.readPicasaIni(a);
      return { album: a, picasa: pic };
    })
  );
  return entries.map((entry) => {
    const p = picasa.find((e) => e.album.key === entry.album.key);
    if (!p) {
      return {
        ...entry,
        picasa: {},
      };
    }
    return {
      ...entry,
      picasa: p!.picasa[entry.name] || {},
    };
  });
}

export async function getAlbumInfo(
  album: Album,
  useSettings: boolean = false
): Promise<AlbumInfo> {
  let settings: Settings = {
    sort: "date",
    iconSize: 250,
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
  let entries = contents.entries;

  if (settings.filters.star) {
    entries = entries.filter((v) => {
      return !!picasa[v.name].star;
    });
  }
  if (settings.filters.video) {
    entries = entries.filter((v) =>
      videoExtensions.find((e) => v.name.toLowerCase().endsWith(e))
    );
  }
  /*
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
  */
  return { picasa, assets: entries };
}

export async function getFileExifData(entry: AlbumEntry): Promise<any> {
  const service = await getService();
  const exif = await service.exifData(entry);
  return exif;
}
