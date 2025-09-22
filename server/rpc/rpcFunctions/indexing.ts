import { AlbumEntry } from "../../../shared/types/types";
import { 
  queryFoldersByStrings, 
  getAllFolders, 
  getPicturesInFolder, 
  searchPictures, 
  getIndexingStats,
  indexPicture,
  queryAlbumEntries,
  FolderQuery,
  PictureIndex
} from "../../../worker/background/bg-indexing";

/**
 * Query folders by matching strings
 */
export async function queryFolders(matchingStrings: string[]): Promise<FolderQuery[]> {
  return queryFoldersByStrings(matchingStrings);
}

/**
 * Get all folders in the index
 */
export async function getAllIndexedFolders(): Promise<FolderQuery[]> {
  return getAllFolders();
}

/**
 * Get pictures in a specific folder
 */
export async function getFolderPictures(folderPath: string): Promise<PictureIndex[]> {
  return getPicturesInFolder(folderPath);
}

/**
 * Search pictures by text
 */
export async function searchIndexedPictures(searchTerm: string, limit?: number): Promise<PictureIndex[]> {
  return searchPictures(searchTerm, limit);
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
