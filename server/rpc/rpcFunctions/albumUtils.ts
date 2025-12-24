import {
  debounce,
  idFromAlbumEntry,
  isPicture,
  isVideo,
  removeDiacritics,
  sortByKey
} from "../../../shared/lib/utils";
import { events } from "../../../shared/server-events";
import {
  Album,
  AlbumEntry,
  AlbumEntryMetaData,
  AlbumEntryWithMetadataAndExif,
  AlbumWithData,
  Filters
} from "../../../shared/types/types";
import { getFolderAlbumData, media as getMedia } from "../../media";
import {
  getContactAlbums as getContactAlbumsFromFaces
} from "../../operations/faces/faces";
import { searchPicturesByFilters } from "../../services/search/queries";
import { getAlbumMetaData, getEntryMetadata, getMutations } from "../../services/walker/queries";
import {
  assetsInFolderAlbum,
} from "../fileAndFolders";
import { getExifData } from "./exif";

/**
 * Get all contact (face) albums
 */
export async function getContactAlbums(): Promise<AlbumWithData[]> {
  return getContactAlbumsFromFaces();
}

export async function setRank(entry: AlbumEntry, rank: number): Promise<void> {
  const entries = (await getMedia(entry.album)).entries;
  const entryIndex = entries.findIndex(
    (e) => idFromAlbumEntry(e, "") === idFromAlbumEntry(entry, ""),
  );
  if (entryIndex !== -1) {
    if (rank > entryIndex) rank--;
    entries.splice(entryIndex, 1);
    entries.splice(rank, 0, entry);
    await assignRanks(entries);
    notifyAlbumOrderUpdated(entry.album);
  }
}

async function notifyAlbumOrderUpdated(album: Album) {
  const albumData = await albumWithData(album);
  if (!albumData) return;
  debounce(
    () => {
      events.emit("albumUpdated", albumData);
    },
    100,
    "setRank/" + album.name,
    false,
  );
}

async function assignRanks(filesInFolder: AlbumEntry[]): Promise<void> {
  let rank = 0;
  for (const entry of filesInFolder) {
    if (isPicture(entry) || isVideo(entry)) {
      let current = getEntryMetadata(entry).rank || "0";
      if (rank !== parseInt(current)) {
        const mutations = getMutations();
        await mutations.updateEntryMetadata(entry, "rank", rank);
      }
      rank++;
    }
  }
}

export async function sortAlbum(album: Album, order: string): Promise<void> {
  const entries = (await getMedia(album)).entries;

  switch (order) {
    case "reverse":
      {
        await assignRanks(entries.reverse());
        notifyAlbumOrderUpdated(album);
      }
      break;
    case "name":
      {
        const sorted = entries.sort((e1, e2) => {
          return e1.name.toLowerCase() < e2.name.toLowerCase()
            ? -1
            : e1.name.toLowerCase() > e2.name.toLowerCase()
              ? 1
              : 0;
        });
        await assignRanks(sorted);
        notifyAlbumOrderUpdated(album);
      }
      break;
    case "date":
      {
        const entriesWithDates = await Promise.all(
          entries.map(async (entry) => ({
            entry,
            metadata: getEntryMetadata(entry),
          })),
        );
        const sorted = entriesWithDates.sort((e1, e2) => {
          if (
            e1.metadata.dateTaken !== undefined &&
            e2.metadata.dateTaken !== undefined
          )
            return (
              new Date(e1.metadata.dateTaken).getTime() -
              new Date(e2.metadata.dateTaken).getTime()
            );
          return 0;
        });
        const sortedEntries = sorted.map((e) => e.entry);
        await assignRanks(sortedEntries);

        notifyAlbumOrderUpdated(album);
      }
      break;
  }
}

export async function mediaCount(album: Album, filters?: Filters): Promise<{ count: number }> {
  if (filters) {
    // Use database-level filtering for better performance
    const entries = await searchPicturesByFilters(filters, undefined, album.key);
    return { count: entries.length };
  }
  const assets = await assetsInFolderAlbum(album);
  return { count: assets.entries.length };
}

/**
 * Returns true if the entry should be included in the filtered list
 * @param entry The entry
 * @param AlbumEntryMetaData the picasa metadata for that entry
 * @param filter a lowercase diacritic-insensitive filter
 * @returns
 */
function inFilter(entry: AlbumEntry, meta: AlbumEntryMetaData, filter: string) {
  if (filter === "") return true;
  return (
    removeDiacritics(entry.name).toLowerCase().includes(filter) ||
    (meta.caption &&
      removeDiacritics(meta.caption).toLowerCase().includes(filter)) ||
    removeDiacritics(entry.album.name).toLowerCase().includes(filter) ||
    (meta.text && removeDiacritics(meta.text).toLowerCase().includes(filter))
    // Note: geoPOI filtering is now handled by the search service at the database level
  );
}

/**
 * Returns the contents of an album, sorted by its rank
 * @param album
 * @returns
 */
export async function media(
  album: Album,
  filters?: Filters,
): Promise<{ entries: AlbumEntry[] }> {
  // Use media function (calls search or walker queries based on filters)
  return getMedia(album, filters);
}

async function sortAssetsByRank(entries: AlbumEntry[]) {
  await Promise.all(
    entries.map(async (entry) => {
      const meta = getEntryMetadata(entry);
      Object.assign(entry, { rank: meta.rank });
    }),
  );

  sortByKey(entries as (AlbumEntry & { rank: any })[], ["rank"], ["numeric"]);
}

export async function albumWithData(
  album: Album | string,
): Promise<AlbumWithData | undefined> {
  const key = typeof album === "string" ? album : album.key;
  return getFolderAlbumData(key);
}

export async function getAlbumMetadata(album: Album) {
  const ini = getAlbumMetaData(album);
  return ini;
}

export async function getAlbumEntryMetadata(albumEntry: AlbumEntry) {
  const albumMetadata = await getAlbumMetadata(albumEntry.album);
  return albumMetadata[albumEntry.name] as AlbumEntryMetaData;
}



export async function getSourceEntry(entry: AlbumEntry) {
  return entry;
}

export async function albumEntriesWithMetadataAndExif(
  entries: AlbumEntry[],
): Promise<AlbumEntryWithMetadataAndExif[]> {
  return Promise.all(
    entries.map(async (entry) => {
      const [metadata, exif] = await Promise.all([
        getEntryMetadata(entry),
        getExifData(entry),
      ]);
      return {
        ...entry,
        metadata,
        exif,
      };
    }),
  );
}
