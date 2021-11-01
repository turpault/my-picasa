/* eslint-disable @typescript-eslint/camelcase */
import { encode } from "punycode";
import {
  buildContext,
  cloneContext,
  destroyContext,
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
    encode: {
      handler: encode,
      arguments: ["context:string"],
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
      arguments: ["file:string", "data:object"],
    },
    folder: {
      handler: folder,
      arguments: ["folder:string"],
    },
  },
};
