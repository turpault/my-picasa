import { AlbumEntry, Album, AlbumWithData, Filters } from "../../../shared/types/types";
import {
  queryFoldersByFilters as queryFoldersByFiltersService,
  searchPicturesByFilters,
  getIndexingStats,
  indexPicture,
  queryAlbumEntries
} from "../../../worker/background/bg-indexing";


/**
 * Query folders by Filters object
 */
export async function queryFoldersByFilters(filters: Filters): Promise<AlbumWithData[]> {
  return queryFoldersByFiltersService(filters);
}


/**
 * Search pictures by Filters object
 */
export async function searchIndexedPicturesByFilters(filters: Filters, limit?: number, albumId?: string): Promise<AlbumEntry[]> {
  return searchPicturesByFilters(filters, limit, albumId);
}

/**
 * Get indexing statistics
 */
export async function getIndexingStatistics(): Promise<{ totalPictures: number; totalFolders: number; lastUpdated: string }> {
  return getIndexingStats();
}

/**
 * Index a specific picture entry
 */
export async function indexPictureEntry(entry: AlbumEntry): Promise<void> {
  return indexPicture(entry);
}

/**
 * Query AlbumEntry objects within a specific album by matching strings
 */
export async function queryAlbumEntriesInAlbum(albumId: string, matchingStrings: string[]): Promise<AlbumEntry[]> {
  return queryAlbumEntries(albumId, matchingStrings);
}
