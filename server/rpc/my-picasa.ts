/* eslint-disable @typescript-eslint/camelcase */
import {
  buildContext,
  cloneContext,
  commit,
  destroyContext,
  encode,
  execute,
  setOptions,
  transform,
} from "./rpcFunctions/sharp-processor";
import { folder, readFileContents, writeFileContents } from "./rpcFunctions/fs";
import { Exceptions } from "../../shared/types/exceptions";
import { createJob } from "./rpcFunctions/fileJobs";
import { getJob } from "./rpcFunctions/fileJobs";
import { folders } from "./rpcFunctions/walker";
import { ServiceMap } from "./rpcHandler";
import { exifData } from "./rpcFunctions/exif";

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
      arguments: ["fileName:string"],
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
      handler: createJob,
      arguments: ["jobName:string", "jobData:object"],
    },
    folders: {
      handler: folders,
      arguments: [],
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
    exifData: {
      handler: exifData,
      arguments: ["file:string"],
    },
  },
};
