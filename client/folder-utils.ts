import {
  Album,
  AlbumContents,
  AlbumEntry,
  Filters
} from "../shared/types/types";
import { getAlbumMetadata } from "./lib/handles";
import { getSettings, isFilterEmpty } from "./lib/settings";
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

  // Gettings contents might change the picasa data
  const contents = await albumContents(
    album,
    useSettings ? isFilterEmpty(getSettings().filters) : undefined,
  );
  const picasa = await getAlbumMetadata(album);
  let entries = contents.entries;

  return {
    metadata: picasa,
    entries: entries,
    filtered,
  };
}

export async function getFileExifData(entry: AlbumEntry): Promise<any> {
  const service = await getService();
  const exif = await service.getExifData(entry);
  return exif;
}

export async function getFilesExifData(entries: AlbumEntry[]): Promise<any> {
  return Promise.all(entries.map((e) => getFileExifData(e)));
}
