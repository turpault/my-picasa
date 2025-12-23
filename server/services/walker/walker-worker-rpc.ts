import { ServiceMap } from "../../rpc/rpc-handler";
import {
  updateEntryMetadata,
  updatePicasaEntry,
  setCaption,
  setFilters,
  setRotate,
  toggleStar,
  rotate,
  setPicasaAlbumShortcut,
  touchPicasaEntry,
} from "./mutations";

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
  ],
  name: "WalkerWorkerClient",
  constants: {},
  functions: {
    updateEntryMetadata: {
      handler: updateEntryMetadata,
      arguments: ["entry:object", "metadata:object"],
    },
    updatePicasaEntry: {
      handler: updatePicasaEntry,
      arguments: ["entry:object", "field:string", "value:any"],
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
    setPicasaAlbumShortcut: {
      handler: setPicasaAlbumShortcut,
      arguments: ["album:object", "shortcut:string"],
    },
    touchPicasaEntry: {
      handler: touchPicasaEntry,
      arguments: ["entry:object"],
    },
  },
};

