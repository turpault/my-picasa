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
import { searchPicturesByFilters } from "./services/search/queries";
import { getAlbumEntries } from "./services/walker/queries";
import {
  getProjects,
} from "./rpc/albumTypes/projects";
import {
  readFaceAlbumEntries,
} from "./rpc/rpcFunctions/faces";
import { getPicasaEntry, updatePicasaEntry } from "./rpc/rpcFunctions/picasa-ini";
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
    const entries = getAlbumEntries(album);

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

// Re-export functions from walker worker
export { getFolderAlbums, folders, getFolderAlbumData } from "./services/walker/worker";

