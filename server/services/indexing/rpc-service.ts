import { ServiceMap } from "../../../rpc/rpc-handler";
import { getIndexingService } from "./worker";
import { queryFoldersByFilters, searchPicturesByFilters, queryAlbumEntries, getAlbumEntries, getAllFolders } from "./worker";
import { Filters, Album, AlbumEntry, AlbumWithData } from "../../../../shared/types/types";

/**
 * IndexingWorker RPC Service
 * Exposes read-only database access and write operations for indexing
 */
export const IndexingWorkerService: ServiceMap = {
  imports: [
    { symbol: "Filters", module: "../../../../../shared/types/types" },
    { symbol: "Album", module: "../../../../../shared/types/types" },
    { symbol: "AlbumEntry", module: "../../../../../shared/types/types" },
    { symbol: "AlbumWithData", module: "../../../../../shared/types/types" },
  ],
  name: "IndexingWorker",
  constants: {},
  functions: {
    // Read functions - can be called from main thread
    queryFoldersByFilters: {
      handler: function(this: any, filters: Filters): AlbumWithData[] {
        return queryFoldersByFilters(filters);
      },
      arguments: ["filters:object"],
    },
    searchPicturesByFilters: {
      handler: function(this: any, filters: Filters, limit?: number, albumId?: string): AlbumEntry[] {
        return searchPicturesByFilters(filters, limit, albumId);
      },
      arguments: ["filters:object", "limit?:number", "albumId?:string"],
    },
    queryAlbumEntries: {
      handler: function(this: any, albumId: string, matchingStrings: string[]): AlbumEntry[] {
        return queryAlbumEntries(albumId, matchingStrings);
      },
      arguments: ["albumId:string", "matchingStrings:object[]"],
    },
    getAlbumEntries: {
      handler: async function(this: any, album: Album): Promise<AlbumEntry[]> {
        return getAlbumEntries(album);
      },
      arguments: ["album:object"],
    },
    getAllFolders: {
      handler: function(this: any): AlbumWithData[] {
        return getAllFolders();
      },
      arguments: [],
    },
    // Write functions - must be called from worker thread
    reindex: {
      handler: async function(this: any): Promise<void> {
        const service = getIndexingService();
        // Rebuild FTS index
        service.rebuildFTSIndex();
        // Check and fix integrity
        await service.checkAndFixFTSIntegrity();
      },
      arguments: [],
    },
  },
};

