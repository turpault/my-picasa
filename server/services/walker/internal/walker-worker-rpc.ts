import { ServiceMap } from "../../../rpc/rpc-handler";
import {
  updateEntryMetadata,
  setCaption,
  setFilters,
  setRotate,
  toggleStar,
  rotate,
  updateAlbumShortcut,
  touchPicasaEntry,
} from "./mutations";
import { refreshAlbumKeys, refreshAlbums, onRenamedAlbums, reindexAlbums } from "./walk";
import {
  getPicasaIdentifiedReferences,
  getAlbumPicasaContactByHash,
} from "./picasa-read-queries";

/**
 * WalkerWorkerClient RPC Service Definition
 * 
 * This service exposes mutation operations that can be called from the main thread
 * to the walker worker thread. The worker thread implements these handlers.
 */
export const WalkerWorkerClient: ServiceMap = {
  imports: [
    { symbol: "AlbumEntry", module: "../../../shared/types/types" },
    { symbol: "AlbumEntryMetaData", module: "../../../shared/types/types" },
    { symbol: "Album", module: "../../../shared/types/types" },
    { symbol: "Contact", module: "../../../shared/types/types" },
  ],
  name: "WalkerWorkerClient",
  constants: {},
  functions: {
    updateEntryMetadata: {
      handler: updateEntryMetadata,
      arguments: ["entry:object", "fieldOrMetadata:any", "value?:any"],
    },
    setCaption: {
      handler: setCaption,
      arguments: ["entry:object", "caption:string"],
    },
    setFilters: {
      handler: setFilters,
      arguments: ["entry:object", "filters:string"],
    },
    setRotate: {
      handler: setRotate,
      arguments: ["entry:object", "rotate?:string"],
    },
    toggleStar: {
      handler: toggleStar,
      arguments: ["entries:object"],
    },
    rotate: {
      handler: rotate,
      arguments: ["entries:object", "direction:string"],
    },
    updateAlbumShortcut: {
      handler: updateAlbumShortcut,
      arguments: ["album:object", "shortcut:string"],
    },
    touchPicasaEntry: {
      handler: touchPicasaEntry,
      arguments: ["entry:object"],
    },
    refreshAlbumKeys: {
      handler: refreshAlbumKeys,
      arguments: ["albumKeys:object"],
    },
    refreshAlbums: {
      handler: refreshAlbums,
      arguments: ["albums:object"],
    },
    onRenamedAlbums: {
      handler: onRenamedAlbums,
      arguments: ["from:object", "to:object"],
    },
    reindexAlbums: {
      handler: reindexAlbums,
      arguments: ["albumIds:object"],
    },
    getPicasaIdentifiedReferences: {
      handler: getPicasaIdentifiedReferences,
      arguments: ["entry:object"],
    },
    getAlbumPicasaContactByHash: {
      handler: getAlbumPicasaContactByHash,
      arguments: ["album:object", "hash:string"],
    },
  },
};

