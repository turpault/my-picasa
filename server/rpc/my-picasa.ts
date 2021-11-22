/* eslint-disable @typescript-eslint/camelcase */
import { Exceptions } from "../../shared/types/exceptions.js";
import { undo, undoList } from "../utils/undo.js";
import {
  buildContext,
  cloneContext,
  commit,
  destroyContext,
  encode,
  execute,
  setOptions,
  transform,
} from "./imageOperations/sharp-processor.js";
import { exifData } from "./rpcFunctions/exif.js";
import { createFSJob, getJob } from "./rpcFunctions/fileJobs.js";
import {
  folder,
  makeAlbum,
  openAlbumInFinder,
  readFileContents,
  writeFileContents,
} from "./rpcFunctions/fs.js";
import {
  readPicasaEntry,
  readPicasaIni,
  updatePicasaEntry,
} from "./rpcFunctions/picasaIni.js";
import { folders, media } from "./rpcFunctions/walker.js";
import { ServiceMap } from "./rpcHandler.js";

/**
 * ConcurrencyService IDL
 */
export const MyPicasa: ServiceMap = {
  name: "MyPicasa",
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
      arguments: ["context:string"],
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
      arguments: ["hash:object"],
    },
    createJob: {
      handler: createFSJob,
      arguments: ["jobName:string", "jobData:object"],
    },
    folders: {
      handler: folders,
      arguments: ["filter:string"],
    },
    media: {
      handler: media,
      arguments: ["album:object", "filter:string"],
    },
    readFileContents: {
      handler: readFileContents,
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
    readPicasaIni: {
      handler: readPicasaIni,
      arguments: ["album:object"],
    },
    exifData: {
      handler: exifData,
      arguments: ["entry:object"],
    },
    readPicasaEntry: {
      handler: readPicasaEntry,
      arguments: ["entry:object"],
    },
    updatePicasaEntry: {
      handler: updatePicasaEntry,
      arguments: ["entry:object", "field:string", "value:any"],
    },
    makeAlbum: {
      handler: makeAlbum,
      arguments: ["name:string"],
    },
    openInFinder: {
      handler: openAlbumInFinder,
      arguments: ["album:object"],
    },
    undoList: {
      handler: undoList,
      arguments: [],
    },
    undo: {
      handler: undo,
      arguments: ["id:string"],
    },
  },
};
