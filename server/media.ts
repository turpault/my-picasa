import {
  sortByKey
} from "../shared/lib/utils";
import {
  Album,
  AlbumEntry,
  AlbumWithData,
  Filters,
  idFromKey,
  ProjectType,
} from "../shared/types/types";
import { searchPicturesByFilters, searchFoldersByFilters } from "./services/search/queries";
import { getAllAlbums, getAlbum, getAlbumEntries as getWalkerAlbumEntries } from "./services/walker/queries";
import {
  getProjects,
} from "./rpc/projects";
import {
  readFaceAlbumEntries,
} from "./operations/faces/faces";
import { getEntryMetadata, getMutationsIfAvailable, getShortcuts } from "./services/walker/queries";
import { getWalkerReadyPromise } from "./worker-manager";
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
  if (filters) {
    // Use search service queries for filtered results
    const entries = searchPicturesByFilters(filters, undefined, album.key);
    await sortAssetsByRank(entries);
    return { entries };
  }
  // Use walker service queries when no filters (direct album entries)
  const entries = await getWalkerAlbumEntries(album);

  await sortAssetsByRank(entries);
  await assignRanks(entries);
  return { entries };
}

async function sortAssetsByRank(entries: AlbumEntry[]) {
  for (const entry of entries) {
    const meta = await getEntryMetadata(entry);
    Object.assign(entry, { rank: meta.rank });
  }

  sortByKey(entries as (AlbumEntry & { rank: any })[], ["rank"], ["numeric"]);
}

async function assignRanks(filesInFolder: AlbumEntry[]): Promise<void> {
  const mutations = getMutationsIfAvailable();
  if (!mutations) {
    // Walker worker not available (e.g. when running in faces/search worker thread)
    return;
  }
  let rank = 0;
  for (const entry of filesInFolder) {
    if (isPicture(entry) || isVideo(entry)) {
      let current = (await getEntryMetadata(entry)).rank || "0";
      if (rank !== parseInt(current)) {
        await mutations.updateEntryMetadata(entry, "rank", rank);
      }
      rank++;
    }
  }
}

/**
 * Get folder albums, optionally filtered by search criteria
 */
export async function getAlbums(filters?: Filters): Promise<AlbumWithData[]> {
  if (filters) {
    // Use database-level filtering for better performance
    const matchedAlbums = await searchFoldersByFilters(filters);

    // Complete with shortcuts
    const shortcuts = await getShortcuts();
    for (const album of matchedAlbums) {
      const shortcut = shortcuts.find((s) => s.album.key === album.key);
      if (shortcut) {
        album.shortcut = shortcut.shortcut;
      }
    }
    return matchedAlbums;
  }
  // Wait for walker to finish first scan so albums table is populated
  await getWalkerReadyPromise();
  return await getAllAlbums();
}

/**
 * Get folder album data by key
 */
export async function getFolderAlbumData(key: string): Promise<AlbumWithData> {
  const album = await getAlbum(key);
  if (!album) {
    throw new Error(`Album ${key} not found`);
  }
  return album;
}

/**
 * Get album entries from the walker database
 */
export async function getAlbumEntries(album: Album): Promise<AlbumEntry[]> {
  return getWalkerAlbumEntries(album);
}

