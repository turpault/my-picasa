/* eslint-disable @typescript-eslint/camelcase */
import { Exceptions } from "../../shared/types/exceptions";
import {
  buildContext,
  cloneContext,
  commit,
  destroyContext,
  encode,
  execute,
  setOptions,
  transform,
} from "./imageOperations/sharp-processor";
import { exifData } from "./rpcFunctions/exif";
import { createFSJob, getJob } from "./rpcFunctions/fileJobs";
import {
  folder,
  makeAlbum,
  openAlbumInFinder,
  readFileContents,
  writeFileContents,
} from "./rpcFunctions/fs";
import {
  readPicasaEntry,
  readPicasaIni,
  updatePicasaEntry,
} from "./rpcFunctions/picasaIni";
import { readOrMakeThumbnail } from "./rpcFunctions/thumbnail";
import { folders, mediaInAlbum } from "./rpcFunctions/walker";
import { ServiceMap } from "./rpcHandler";

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
      arguments: [],
    },
    media: {
      handler: mediaInAlbum,
      arguments: ["album:object"],
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
    readOrMakeThumbnail: {
      handler: readOrMakeThumbnail,
      arguments: ["entry:object", "size:string"],
    },
    openInFinder: {
      handler: openAlbumInFinder,
      arguments: ["album:object"],
    },
  },
};
