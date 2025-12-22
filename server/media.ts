import {
  sortByKey
} from "../shared/lib/utils";
import {
  Album,
  AlbumEntry,
  AlbumKind,
  AlbumWithData,
  Filters,
  idFromKey,
  ProjectType,
} from "../shared/types/types";
import { searchPicturesByFilters, searchFoldersByFilters } from "./services/search/queries";
import { getAllAlbums, getAlbum, getAlbumEntries as getWalkerAlbumEntries } from "./services/walker/queries";
import {
  getProjects,
} from "./rpc/albumTypes/projects";
import {
  readFaceAlbumEntries,
} from "./rpc/rpcFunctions/faces";
import { getPicasaEntry, updatePicasaEntry } from "./rpc/rpcFunctions/picasa-ini";
import { getShortcuts } from "./rpc/rpcFunctions/picasa-ini";
import { isPicture, isVideo } from "../shared/lib/utils";

/**
 * Returns the contents of an album, sorted by its rank
 * Uses search service queries when filters are present, walker service queries otherwise
 * @param album
 * @param filters Optional filters for searching
 * @returns
 */
export async function media(
  album: Album,
  filters?: Filters,
): Promise<{ entries: AlbumEntry[] }> {
  if (album.kind === AlbumKind.FOLDER) {
    if (filters) {
      // Use search service queries for filtered results
      const entries = searchPicturesByFilters(filters, undefined, album.key);
      await sortAssetsByRank(entries);
      return { entries };
    }
    // Use walker service queries when no filters (direct album entries)
    const entries = getWalkerAlbumEntries(album);

    await sortAssetsByRank(entries);
    await assignRanks(entries);
    return { entries };
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

/**
 * Get all folder albums from the walker database
 */
export async function getFolderAlbums(): Promise<AlbumWithData[]> {
  return getAllAlbums();
}

/**
 * Get folder albums, optionally filtered by search criteria
 */
export async function folders(filters?: Filters): Promise<AlbumWithData[]> {
  if (filters) {
    // Use database-level filtering for better performance
    const matchedAlbums = await searchFoldersByFilters(filters);

    // Complete with shortcuts
    const shortcuts = Object.values(getShortcuts());
    for (const album of matchedAlbums) {
      const shortcut = shortcuts.find((s) => s.key === album.key);
      if (shortcut) {
        album.shortcut = shortcut.name;
      }
    }
    return matchedAlbums;
  }
  return getAllAlbums();
}

/**
 * Get folder album data by key
 */
export function getFolderAlbumData(key: string): AlbumWithData {
  const album = getAlbum(key);
  if (!album) {
    throw new Error(`Album ${key} not found`);
  }
  return album;
}

/**
 * Get album entries from the walker database
 */
export function getAlbumEntries(album: Album): AlbumEntry[] {
  return getWalkerAlbumEntries(album);
}

