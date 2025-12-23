import {
  debounce,
  idFromAlbumEntry,
  isPicture,
  isVideo,
  removeDiacritics,
  sortByKey
} from "../../../shared/lib/utils";
import {
  Album,
  AlbumEntry,
  AlbumEntryMetaData,
  AlbumEntryWithMetadataAndExif,
  AlbumKind,
  AlbumWithData,
  Filters,
  idFromKey,
  ProjectType,
} from "../../../shared/types/types";
import { searchFoldersByFilters, searchPicturesByFilters } from "../../services/search/queries";
import { getFolderAlbums, getFolderAlbumData } from "../../media";
import { media as getMedia } from "../../media";
import {
  assetsInFolderAlbum,
  queueNotification,
} from "../albumTypes/fileAndFolders";
import {
  getProjectAlbumFromKey,
  getProjectAlbums,
  getProjects,
} from "../albumTypes/projects";
import {
  getFaceAlbum,
  getFaceAlbums,
  getFaceData,
  readFaceAlbumEntries,
} from "./faces";
import { getExifData } from "./exif";
import { getAlbumMetaData, getPicasaEntries, getPicasaEntry, updatePicasaEntry } from "./picasa-ini";

export async function setRank(entry: AlbumEntry, rank: number): Promise<void> {
  const entries = (await media(entry.album)).entries;
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
  debounce(
    () => {
      queueNotification({
        type: "albumOrderUpdated",
        album: albumData,
      });
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
      let current = (await getPicasaEntry(entry)).rank || "0";
      if (rank !== parseInt(current)) {
        updatePicasaEntry(entry, "rank", rank);
      }
      rank++;
    }
  }
}

export async function sortAlbum(album: Album, order: string): Promise<void> {
  const entries = (await media(album)).entries;

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
            metadata: await getPicasaEntry(entry),
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
  if (album.kind === AlbumKind.FOLDER) {
    if (filters) {
      // Use database-level filtering for better performance
      const entries = await searchPicturesByFilters(filters, undefined, album.key);
      return { count: entries.length };
    }
    const assets = await assetsInFolderAlbum(album);
    return { count: assets.entries.length };
  } else if (album.kind === AlbumKind.FACE) {
    const entries = await getPicasaEntries(album);
    return { count: entries.length };
  } else throw new Error(`Unknown kind ${album.kind}`);
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
  if (album.kind === AlbumKind.FOLDER) {
    // Use media function (calls search or walker queries based on filters)
    return getMedia(album, filters);
  } else if (album.kind === AlbumKind.FACE) {
    const entries = await readFaceAlbumEntries(album);
    await sortAssetsByRank(entries);
    await assignRanks(entries);
    return { entries };
  } else if (album.kind === AlbumKind.PROJECT) {
    const entries = await getProjects(idFromKey(album.key).id as ProjectType);
    return { entries };
  } else throw new Error(`Unknown kind ${album.kind}`);
}

async function sortAssetsByRank(entries: AlbumEntry[]) {
  await Promise.all(
    entries.map(async (entry) => {
      const meta = await getPicasaEntry(entry);
      Object.assign(entry, { rank: meta.rank });
    }),
  );

  sortByKey(entries as (AlbumEntry & { rank: any })[], ["rank"], ["numeric"]);
}

export async function albumWithData(
  album: Album | string,
): Promise<AlbumWithData | undefined> {
  const kind = typeof album === "string" ? idFromKey(album).kind : album.kind;
  const key = typeof album === "string" ? album : album.key;
  if (kind === AlbumKind.FOLDER) {
    return getFolderAlbumData(key);
  } else if (kind === AlbumKind.PROJECT) {
    return await getProjectAlbumFromKey(key);
  } else if (kind === AlbumKind.FACE) {
    return getFaceAlbum(key);
  } else throw new Error(`Unknown kind ${kind}`);
}

export async function getAlbumMetadata(album: Album) {
  switch (album.kind) {
    case AlbumKind.FOLDER: {
      const ini = await getAlbumMetaData(album);
      return ini;
    }
    case AlbumKind.PROJECT:
      return {};
    case AlbumKind.FACE: {
      const ini = await getAlbumMetaData(album);
      await Promise.all(
        Object.keys(ini).map(async (name) => {
          const faceData = await getFaceData({ album, name });

          const originalEntry = await getPicasaEntry(faceData.originalEntry);
          if (originalEntry) {
            if (originalEntry.dateTaken)
              ini[name].dateTaken = originalEntry.dateTaken;
            if (originalEntry.star) ini[name].star = originalEntry.star;
          }
        }),
      );
      return ini;
    }
    default:
      throw new Error(`Unkown kind ${album.kind}`);
  }
}

export async function getAlbumEntryMetadata(albumEntry: AlbumEntry) {
  const albumMetadata = await getAlbumMetadata(albumEntry.album);
  return albumMetadata[albumEntry.name] as AlbumEntryMetaData;
}

export async function monitorAlbums(filters?: Filters): Promise<{}> {
  const f = getFaceAlbums();
  const p = await getProjectAlbums();

  let albums: AlbumWithData[] = [];

  if (filters) {
    // Use database-level filtering for better performance
    const matchedAlbums = await searchFoldersByFilters(filters);
    albums = [...matchedAlbums, ...f, ...p];
  } else {
    const lastWalk = await getFolderAlbums();
    albums = [...lastWalk, ...f, ...p];
  }

  // All filtering is now done at the database level in PictureIndexingService

  queueNotification({ type: "albums", albums });
  return {};
}


export async function getSourceEntry(entry: AlbumEntry) {
  switch (entry.album.kind) {
    case AlbumKind.FOLDER:
      return entry;
    case AlbumKind.FACE:
      const faceData = await getFaceData(entry);
      return faceData.originalEntry;
    default:
      throw new Error(`Unkown kind ${entry.album.kind}`);
  }
}

export async function albumEntriesWithMetadataAndExif(
  entries: AlbumEntry[],
): Promise<AlbumEntryWithMetadataAndExif[]> {
  return Promise.all(
    entries.map(async (entry) => {
      const [metadata, exif] = await Promise.all([
        getPicasaEntry(entry),
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
