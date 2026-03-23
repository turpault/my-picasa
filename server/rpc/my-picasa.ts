/* eslint-disable @typescript-eslint/camelcase */
import { Exceptions } from "../../shared/types/exceptions";
import { getFaceDataFromAlbumEntry } from "../services/faces/face-db-reader";
import {
  getConvolutionKernelNames,
  getFilterGroups,
  getFilterList,
} from "../imageOperations/image-filters";
import { imageInfo } from "../imageOperations/info";
import {
  buildContext,
  cloneContext,
  commit,
  destroyContext,
  encode,
  execute,
  histogram,
  setOptions,
  transform,
} from "../imageOperations/sharp-processor";
import { undo, undoList } from "../utils/undo";
import { getAlbums } from "../media";
import { AlbumEntry, Filters, AlbumWithData } from "../../shared/types/types";
import { getContacts } from "../services/faces/queries";
import {
  createProject,
  getProject,
  getProjects,
  getProjectsCount,
  writeProject,
} from "./projects";
import { getContactAlbums } from "./rpcFunctions/albumUtils";
import { ServiceMap } from "./rpc-handler";
import {
  albumEntriesWithMetadataAndExif,
  getAlbumEntryMetadata,
  getAlbumMetadata,
  getSourceEntry,
  media,
  mediaCount,
  setRank,
  sortAlbum,
} from "./rpcFunctions/albumUtils";
import { addBug, getBugs } from "./rpcFunctions/bugs";
import { clientException, clientLog } from "./rpcFunctions/clientLog";
import { getExifData, getFileStats } from "./rpcFunctions/exif";
import { geoPOI, getExifCoordinates } from "./rpcFunctions/geolocate";
import { getFeatureFlags, updateFeatureFlags } from "./rpcFunctions/featureFlags";
import { getSettings, updateSettings } from "./rpcFunctions/settings";
import { createFSJob, getJob, waitJob } from "./rpcFunctions/fileJobs";
import {
  folder,
  getFileContents,
  makeAlbum,
  openAlbumEntryInFinder,
  openAlbumInFinder,
  writeFileContents,
} from "./rpcFunctions/fs";
import { addStar } from "../services/walker/internal/mutations";
import {
  getEntryMetadata,
  getShortcuts,
  getMutations,
} from "../services/walker/queries";
import { clientReady } from "./rpcFunctions/ready";
import { setAlbumShortcut } from "./rpcFunctions/shortcuts";

/**
 * PicisaClient IDL
 */
export const PicisaClient: ServiceMap = {
  imports: [{ symbol: "Filters", module: "../../../shared/types/types" }],
  name: "PicisaClient",
  constants: {
    Exceptions,
  },
  functions: {
    buildContext: {
      handler: buildContext,
      arguments: ["entry:object"],
    },
    cloneContext: {
      handler: cloneContext,
      arguments: ["context:string", "hint:string"],
    },
    destroyContext: {
      handler: destroyContext,
      arguments: ["context:string"],
    },
    transform: {
      handler: transform,
      arguments: ["context:string", "operations:string"],
    },
    setOptions: {
      handler: setOptions,
      arguments: ["context:string", "options:object"],
    },
    execute: {
      handler: execute,
      arguments: ["context:string", "operations:object"],
    },
    commit: {
      handler: commit,
      arguments: ["context:string"],
    },
    encode: {
      handler: encode,
      arguments: ["context:string", "mime:string", "format:string"],
    },
    getJob: {
      handler: getJob,
      arguments: ["hash:string"],
    },
    waitJob: {
      handler: waitJob,
      arguments: ["hash:string"],
    },
    createJob: {
      handler: createFSJob,
      arguments: ["jobName:string", "jobData:object"],
    },
    folders: {
      handler: getAlbums,
      arguments: ["filters?:Filters"],
    },
    media: {
      handler: media,
      arguments: ["album:object", "filters?:Filters"],
    },
    mediaCount: {
      handler: mediaCount,
      arguments: ["album:object", "filters?:Filters"],
    },
    getFileContents: {
      handler: getFileContents,
      arguments: ["file:string"],
    },
    writeFileContents: {
      handler: writeFileContents,
      arguments: ["file:string", "data:string"],
    },
    folder: {
      handler: folder,
      arguments: ["folder:string"],
    },
    sortAlbum: {
      handler: sortAlbum,
      arguments: ["album:object", "sort:string"],
    },
    setRank: {
      handler: setRank,
      arguments: ["entry:string", "rank:number"],
    },
    getAlbumMetadata: {
      handler: getAlbumMetadata,
      arguments: ["album:object"],
    },
    getAlbumEntryMetadata: {
      handler: getAlbumEntryMetadata,
      arguments: ["albumEntry:object"],
    },
    getExifData: {
      handler: getExifData,
      arguments: ["entry:object"],
    },
    getFileStats: {
      handler: getFileStats,
      arguments: ["entry:object"],
    },
    geoPOI: {
      handler: geoPOI,
      arguments: ["entry:object"],
    },
    getExifCoordinates: {
      handler: getExifCoordinates,
      arguments: ["entry:object"],
    },
    getPicasaEntry: {
      handler: getEntryMetadata, // Uses getEntryMetadata internally (backward compatible API name)
      arguments: ["entry:object"],
    },
    setFilters: {
      handler: async (entry: AlbumEntry, filters: string) => {
        const mutations = getMutations();
        return await mutations.setFilters(entry, filters);
      },
      arguments: ["entry:object", "filters:string"],
    },
    setCaption: {
      handler: async (entry: AlbumEntry, caption: string) => {
        const mutations = getMutations();
        return await mutations.setCaption(entry, caption);
      },
      arguments: ["entry:object", "caption:string"],
    },
    makeAlbum: {
      handler: makeAlbum,
      arguments: ["name:string"],
    },
    openInFinder: {
      handler: openAlbumInFinder,
      arguments: ["album:object"],
    },
    openEntryInFinder: {
      handler: openAlbumEntryInFinder,
      arguments: ["entry:object"],
    },
    undoList: {
      handler: undoList,
      arguments: [],
    },
    undo: {
      handler: undo,
      arguments: ["id:string"],
    },
    imageInfo: {
      handler: imageInfo,
      arguments: ["entry:object"],
    },
    albumEntriesWithMetadataAndExif: {
      handler: albumEntriesWithMetadataAndExif,
      arguments: ["entries:object[]"],
    },
    log: {
      handler: clientLog,
      arguments: ["event:string", "data:object"],
    },
    exception: {
      handler: clientException,
      arguments: [
        "message:string",
        "file:string",
        "line:number",
        "col:number",
        "error:object",
      ],
    },
    ready: {
      handler: clientReady,
      arguments: [],
    },
    getFilterList: {
      handler: getFilterList,
      arguments: ["group:string"],
    },
    getConvolutionKernelNames: {
      handler: getConvolutionKernelNames,
      arguments: [],
    },
    getFilterGroups: {
      handler: getFilterGroups,
      arguments: [],
    },
    setAlbumShortcut: {
      handler: setAlbumShortcut,
      arguments: ["album:object", "shortcut:string"],
    },
    getShortcuts: {
      handler: getShortcuts,
      arguments: [],
    },
    getSourceEntry: {
      handler: getSourceEntry,
      arguments: ["entry:object"],
    },
    rotate: {
      handler: async (entries: AlbumEntry[], direction: string) => {
        const mutations = getMutations();
        return await mutations.rotate(entries, direction);
      },
      arguments: ["entries:object", "direction:string"],
    },
    toggleStar: {
      handler: async (entries: AlbumEntry[]) => {
        const mutations = getMutations();
        return await mutations.toggleStar(entries);
      },
      arguments: ["entries:object"],
    },
    addStar: {
      handler: async (entries: AlbumEntry[]) => addStar(entries),
      arguments: ["entries:object"],
    },
    getProjects: {
      handler: getProjects,
      arguments: ["type:string"],
    },
    getContactAlbums: {
      handler: getContactAlbums,
      arguments: [],
    },
    getProject: {
      handler: getProject,
      arguments: ["project:object"],
    },
    getProjectsCount: {
      handler: getProjectsCount,
      arguments: ["type:string"],
    },
    writeProject: {
      handler: writeProject,
      arguments: ["data:object", "changeType:string"],
    },
    getFaceDataFromAlbumEntry: {
      handler: getFaceDataFromAlbumEntry,
      arguments: ["entry:object"],
    },
    createProject: {
      handler: createProject,
      arguments: ["type:string", "name:string"],
    },
    histogram: {
      handler: histogram,
      arguments: ["context:string"],
    },
    addBug: {
      handler: addBug,
      arguments: ["description:string"],
    },
    getBugs: {
      handler: getBugs,
      arguments: [],
    },
    getContacts: {
      handler: getContacts,
      arguments: [],
    },
    getFeatureFlags: {
      handler: getFeatureFlags,
      arguments: [],
    },
    updateFeatureFlags: {
      handler: updateFeatureFlags,
      arguments: ["flags:object"],
    },
    getSettings: {
      handler: getSettings,
      arguments: [],
    },
    updateSettings: {
      handler: updateSettings,
      arguments: ["settings:object"],
    },
  },
};
