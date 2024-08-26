/* eslint-disable @typescript-eslint/camelcase */
import { Exceptions } from "../../shared/types/exceptions";
import { folders } from "../walker";
import { generateMosaicFile } from "../imageOperations/image-edits/mosaic";
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
import {
  createProject,
  getProject,
  getProjects,
  writeProject,
} from "./albumTypes/projects";
import { ServiceMap } from "./rpc-handler";
import {
  getAlbumEntryMetadata,
  getAlbumMetadata,
  getSourceEntry,
  media,
  mediaCount,
  monitorAlbums,
  setRank,
  sortAlbum,
} from "./rpcFunctions/albumUtils";
import { clientException, clientLog } from "./rpcFunctions/clientLog";
import { exifData } from "./rpcFunctions/exif";
import { createFSJob, getJob, waitJob } from "./rpcFunctions/fileJobs";
import {
  folder,
  getFileContents,
  makeAlbum,
  openAlbumEntryInFinder,
  openAlbumInFinder,
  writeFileContents,
} from "./rpcFunctions/fs";
import {
  getPicasaEntry,
  getShortcuts,
  rotate,
  setCaption,
  setFilters,
  toggleStar,
} from "./rpcFunctions/picasa-ini";
import { clientReady } from "./rpcFunctions/ready";
import { setAlbumShortcut } from "./rpcFunctions/shortcuts";
import { getFaceDataFromAlbumEntry } from "../background/face/picasa-faces";

/**
 * ConcurrencyService IDL
 */
export const PicisaClient: ServiceMap = {
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
      handler: folders,
      arguments: ["filter:string"],
    },
    monitorAlbums: {
      handler: monitorAlbums,
      arguments: [],
    },
    media: {
      handler: media,
      arguments: ["album:object", "filter:string"],
    },
    mediaCount: {
      handler: mediaCount,
      arguments: ["album:object"],
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
      arguments: ["entry:string", "rank:integer"],
    },
    getAlbumMetadata: {
      handler: getAlbumMetadata,
      arguments: ["album:object"],
    },
    getAlbumEntryMetadata: {
      handler: getAlbumEntryMetadata,
      arguments: ["albumEntry:object"],
    },
    exifData: {
      handler: exifData,
      arguments: ["entry:object"],
    },
    getPicasaEntry: {
      handler: getPicasaEntry,
      arguments: ["entry:object"],
    },
    setFilters: {
      handler: setFilters,
      arguments: ["entry:object", "filters:string"],
    },
    setCaption: {
      handler: setCaption,
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
    log: {
      handler: clientLog,
      arguments: ["event:string", "data:object"],
    },
    exception: {
      handler: clientException,
      arguments: [
        "message:string",
        "file:string",
        "line:integer",
        "col:integer",
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
      handler: rotate,
      arguments: ["entries:object", "direction:string"],
    },
    toggleStar: {
      handler: toggleStar,
      arguments: ["entries:object"],
    },
    getProjects: {
      handler: getProjects,
      arguments: ["type:string"],
    },
    getProject: {
      handler: getProject,
      arguments: ["entry:object"],
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
    buildMosaic: {
      handler: generateMosaicFile,
      arguments: ["entry:object", "width:number", "height:number"],
    },
    histogram: {
      handler: histogram,
      arguments: ["context:string"],
    },
  },
};
