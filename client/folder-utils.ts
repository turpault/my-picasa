import { isVideo } from "../shared/lib/utils";
import {
  Album,
  AlbumContents,
  AlbumEntry,
  Filters
} from "../shared/types/types";
import { getAlbumMetadata } from "./lib/handles";
import { Settings, getSettings } from "./lib/settings";
import { getService } from "./rpc/connect";

async function albumContents(
  fh: Album,
  filters?: Filters,
): Promise<{
  entries: AlbumEntry[];
}> {
  const service = await getService();
  const { entries } = await service.media(fh, filters);
  return { entries };
}

export async function getAlbumContents(
  album: Album,
  useSettings: boolean = false,
): Promise<AlbumContents & { filtered: boolean }> {
  let filtered = false;
  let settings: Settings = {
    sort: "date",
    iconSize: 250,
    filters: {
      star: 0,
      video: false,
      people: false,
      location: false,
      persons: [],
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
    settings.filters,
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

  if (settings.filters.persons && settings.filters.persons.length > 0) {
    entries = entries.filter((v) => {
      if (!picasa[v.name].persons) {
        return false;
      }
      const persons = picasa[v.name].persons.split(",").map((p) => p.trim());
      return settings.filters.persons.every((p) => persons.includes(p));
    });
    filtered = true;
  }

  if (settings.filters.favoritePhoto) {
    entries = entries.filter((v) => picasa[v.name] && picasa[v.name].photostar);
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
    entries: entries,
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
