import { AlbumEntry, Album } from "../../../shared/types/types";
import {
  queryFoldersByStrings,
  searchPictures,
  getIndexingStats,
  indexPicture,
  queryAlbumEntries
} from "../../../worker/background/bg-indexing";

/**
 * Query folders by matching strings
 */
export async function queryFolders(matchingStrings: string[]): Promise<Album[]> {
  return queryFoldersByStrings(matchingStrings);
}



/**
 * Search pictures by text
 */
export async function searchIndexedPictures(searchTerm: string[], limit?: number, albumId?: string): Promise<AlbumEntry[]> {
  return searchPictures(searchTerm, limit, albumId);
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
