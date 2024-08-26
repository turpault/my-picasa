import { isPicture, isVideo, removeDiacritics } from "../shared/lib/utils";
import {
  Album,
  AlbumEntry,
  AlbumEntryPicasa,
  AlbumInfo,
} from "../shared/types/types";
import { getAlbumMetadata } from "./lib/handles";
import { Settings, getSettings } from "./lib/settings";
import { getService } from "./rpc/connect";

export async function getMetadata(
  entries: AlbumEntry[],
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
      const metadata = await s.getAlbumMetadata(a);
      return { album: a, picasa: metadata };
    }),
  );
  return entries.map((entry) => {
    const p = picasa.find((e) => e.album.key === entry.album.key);
    if (!p) {
      return {
        ...entry,
        metadata: {},
      };
    }
    return {
      ...entry,
      metadata: p!.picasa[entry.name] || {},
    };
  });
}

async function albumContents(
  fh: Album,
  filter: string = "",
): Promise<{
  entries: AlbumEntry[];
}> {
  const service = await getService();
  const { entries } = await service.media(fh, filter);
  return { entries };
}

export async function getAlbumInfo(
  album: Album,
  useSettings: boolean = false,
): Promise<AlbumInfo & { filtered: boolean }> {
  let filtered = false;
  let settings: Settings = {
    sort: "date",
    iconSize: 250,
    filters: {
      star: 0,
      video: false,
      people: false,
      location: false,
      favoritePhoto: false,
      text: "",
    },
    inverseSort: false,
  };

  if (useSettings) {
    settings = getSettings();
  }
  // Gettings contents might change the picasa data
  const contents = await albumContents(
    album,
    removeDiacritics(settings.filters.text).toLowerCase(),
  );
  const picasa = await getAlbumMetadata(album);
  let entries = contents.entries;

  if (settings.filters.star) {
    entries = entries.filter((v) => {
      return parseInt(picasa[v.name].starCount || "0") >= settings.filters.star;
    });
    filtered = true;
  }

  if (settings.filters.video) {
    entries = entries.filter((v) => settings.filters.video && isVideo(v));
    filtered = true;
  }

  if (settings.filters.favoritePhoto) {
    entries = entries.filter((v) => picasa[v.name].photostar);
    filtered = true;
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
  return {
    metadata: picasa,
    assets: entries,
    filtered,
  };
}

export async function getFileExifData(entry: AlbumEntry): Promise<any> {
  const service = await getService();
  const exif = await service.exifData(entry);
  return exif;
}

export async function getFilesExifData(entries: AlbumEntry[]): Promise<any> {
  return Promise.all(entries.map((e) => getFileExifData(e)));
}
