import { isPicture, isVideo, removeDiacritics } from "../shared/lib/utils";
import {
  Album,
  AlbumEntry,
  AlbumEntryPicasa,
  AlbumInfo,
} from "../shared/types/types";
import { readAlbumMetadata } from "./lib/handles";
import { Settings, getSettings } from "./lib/settings";
import { getService } from "./rpc/connect";

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
      const metadata = await s.readAlbumMetadata(a);
      return { album: a, picasa: metadata };
    })
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
  fh: Album
): Promise<{
  entries: AlbumEntry[];
}> {
  const service = await getService();
  const { entries } = await service.media(fh);
  return { entries };
}

export async function getAlbumInfo(
  album: Album,
  useSettings: boolean = false
): Promise<AlbumInfo & { filtered: boolean }> {
  let settings: Settings = {
    sort: "date",
    iconSize: 250,
    filters: {
      star: 0,
      video: 0,
      text: "",
    },
    inverseSort: false,
  };

  if (useSettings) {
    settings = getSettings();
  }
  // Gettings contents might change the picasa data
  const contents = await albumContents(album);
  const picasa = await readAlbumMetadata(album);
  let entries = contents.entries;

  if (settings.filters.star) {
    entries = entries.filter((v) => {
      return settings.filters.star <= parseInt(picasa[v.name].starCount || "0");
    });
  }
  if (settings.filters.video) {
    entries = entries.filter(
      (v) =>
        ([0, 2].includes(settings.filters.video) && isVideo(v)) ||
        ([0, 1].includes(settings.filters.video) && isPicture(v))
    );
  }
  if (settings.filters.text) {
    const textToFilter = removeDiacritics(settings.filters.text).toLowerCase();
    entries = entries.filter(
      (v) =>
        removeDiacritics(v.album.name).toLowerCase().includes(textToFilter) ||
        removeDiacritics(v.name).toLowerCase().includes(settings.filters.text)
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
  return {
    metadata: picasa,
    assets: entries,
    filtered:
      settings.filters.star !== 0 ||
      settings.filters.video !== 0 ||
      settings.filters.text !== "",
  };
}

export async function getFileExifData(entry: AlbumEntry): Promise<any> {
  const service = await getService();
  const exif = await service.exifData(entry);
  return exif;
}
