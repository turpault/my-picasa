/**
 * RPC contracts: single source of truth for client/server method names and types.
 * No codegen: when adding or removing RPC methods, update this file and the
 * corresponding ServiceMap on the server (e.g. server/rpc/my-picasa.ts, walker-worker-rpc.ts).
 */

// Re-export for client code that previously used generated PicisaClient.Exceptions
export { Exceptions } from "./types/exceptions";

/** Method names for PicisaClient (main app RPC over WebSocket). */
export const PICISA_METHODS = [
  "buildContext",
  "cloneContext",
  "destroyContext",
  "transform",
  "setOptions",
  "execute",
  "commit",
  "encode",
  "getJob",
  "waitJob",
  "createJob",
  "folders",
  "media",
  "mediaCount",
  "getFileContents",
  "writeFileContents",
  "folder",
  "sortAlbum",
  "setRank",
  "getAlbumMetadata",
  "getAlbumEntryMetadata",
  "getExifData",
  "getFileStats",
  "geoPOI",
  "getExifCoordinates",
  "getPicasaEntry",
  "setFilters",
  "setCaption",
  "makeAlbum",
  "openInFinder",
  "openEntryInFinder",
  "undoList",
  "undo",
  "imageInfo",
  "albumEntriesWithMetadataAndExif",
  "log",
  "exception",
  "ready",
  "getFilterList",
  "getConvolutionKernelNames",
  "getFilterGroups",
  "setAlbumShortcut",
  "getShortcuts",
  "getSourceEntry",
  "rotate",
  "toggleStar",
  "getProjects",
  "getContactAlbums",
  "getProject",
  "getProjectsCount",
  "writeProject",
  "getFaceDataFromAlbumEntry",
  "createProject",
  "histogram",
  "addBug",
  "getBugs",
  "getContacts",
  "getFeatureFlags",
  "updateFeatureFlags",
  "getSettings",
  "updateSettings",
] as const;

/** Method names for WalkerWorkerClient (walker worker RPC). */
export const WALKER_WORKER_METHODS = [
  "updateEntryMetadata",
  "setCaption",
  "setFilters",
  "setRotate",
  "toggleStar",
  "rotate",
  "updateAlbumShortcut",
  "touchPicasaEntry",
  "refreshAlbumKeys",
  "refreshAlbums",
  "onRenamedAlbums",
  "reindexAlbums",
  "getPicasaIdentifiedReferences",
  "getAlbumPicasaContactByHash",
] as const;

/** Transport interface: emit with callback and on for events. */
export interface RpcTransport {
  emit(
    action: string,
    payload: unknown,
    callback?: (err: string, payload: unknown) => void
  ): Promise<void>;
  on(action: string, callback: (payload: unknown, callback: Function) => void): Function;
}

/** Base RPC client: all methods return Promise. */
export type RpcMethods<M extends readonly string[]> = {
  [K in M[number]]: (...args: any[]) => Promise<any>;
};

/** Client type with event subscription. */
export type RpcClientWithOn<T> = T & {
  on(event: string, cb: Function): Function;
};

export type PicisaClientApi = RpcClientWithOn<RpcMethods<typeof PICISA_METHODS>>;
export type WalkerWorkerClientApi = RpcClientWithOn<RpcMethods<typeof WALKER_WORKER_METHODS>>;

/** Param names per method (for building payload.args). Must match server ServiceMap.arguments. */
export const PICISA_PARAM_NAMES: Record<string, readonly string[]> = {
  buildContext: ["entry"],
  cloneContext: ["context", "hint"],
  destroyContext: ["context"],
  transform: ["context", "operations"],
  setOptions: ["context", "options"],
  execute: ["context", "operations"],
  commit: ["context"],
  encode: ["context", "mime", "format"],
  getJob: ["hash"],
  waitJob: ["hash"],
  createJob: ["jobName", "jobData"],
  folders: ["filters"],
  media: ["album", "filters"],
  mediaCount: ["album", "filters"],
  getFileContents: ["file"],
  writeFileContents: ["file", "data"],
  folder: ["folder"],
  sortAlbum: ["album", "sort"],
  setRank: ["entry", "rank"],
  getAlbumMetadata: ["album"],
  getAlbumEntryMetadata: ["albumEntry"],
  getExifData: ["entry"],
  getFileStats: ["entry"],
  geoPOI: ["entry"],
  getExifCoordinates: ["entry"],
  getPicasaEntry: ["entry"],
  setFilters: ["entry", "filters"],
  setCaption: ["entry", "caption"],
  makeAlbum: ["name"],
  openInFinder: ["album"],
  openEntryInFinder: ["entry"],
  undoList: [],
  undo: ["id"],
  imageInfo: ["entry"],
  albumEntriesWithMetadataAndExif: ["entries"],
  log: ["event", "data"],
  exception: ["message", "file", "line", "col", "error"],
  ready: [],
  getFilterList: ["group"],
  getConvolutionKernelNames: [],
  getFilterGroups: [],
  setAlbumShortcut: ["album", "shortcut"],
  getShortcuts: [],
  getSourceEntry: ["entry"],
  rotate: ["entries", "direction"],
  toggleStar: ["entries"],
  getProjects: ["type"],
  getContactAlbums: [],
  getProject: ["project"],
  getProjectsCount: ["type"],
  writeProject: ["data", "changeType"],
  getFaceDataFromAlbumEntry: ["entry"],
  createProject: ["type", "name"],
  histogram: ["context"],
  addBug: ["description"],
  getBugs: [],
  getContacts: [],
  getFeatureFlags: [],
  updateFeatureFlags: ["flags"],
  getSettings: [],
  updateSettings: ["settings"],
};

export const WALKER_WORKER_PARAM_NAMES: Record<string, readonly string[]> = {
  updateEntryMetadata: ["entry", "fieldOrMetadata", "value"],
  setCaption: ["entry", "caption"],
  setFilters: ["entry", "filters"],
  setRotate: ["entry", "rotate"],
  toggleStar: ["entries"],
  rotate: ["entries", "direction"],
  updateAlbumShortcut: ["album", "shortcut"],
  touchPicasaEntry: ["entry"],
  refreshAlbumKeys: ["albumKeys"],
  refreshAlbums: ["albums"],
  onRenamedAlbums: ["from", "to"],
  reindexAlbums: ["albumIds"],
  getPicasaIdentifiedReferences: ["entry"],
  getAlbumPicasaContactByHash: ["album", "hash"],
};
