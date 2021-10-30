import { PicasaFileMeta } from "../types/types";

let workers = [
  new Worker("/dist/src/imageProcess/worker.js", {
    type: "module",
  }),
  new Worker("/dist/src/imageProcess/worker.js", {
    type: "module",
  }),
];
const workerContextMap = new Map<string, Worker>();
function getWorkerForContext(context: string): Worker {
  if (workerContextMap.has(context)) {
    return workerContextMap.get(context)!;
  }
  return workers[Math.floor(Math.random() * workers.length)];
}
function setWorkerForContext(context: string, worker: Worker) {
  workerContextMap.set(context, worker);
}

let requests: Map<string, { resolve: Function; reject: Function }> = new Map();
let requestId = 0;
export async function readPictureWithTransforms(
  fh: any,
  options: any,
  transform: string,
  extraOperations: any[]
): Promise<string> {
  const id = (requestId++).toString();
  return new Promise<string>((resolve, reject) => {
    requests.set(id, { resolve, reject });

    getWorkerForContext("").postMessage([
      id,
      "readPictureWithTransforms",
      fh,
      options,
      transform,
      extraOperations,
    ]);
  });
}

export async function buildContext(fh: any): Promise<string> {
  const id = (requestId++).toString();
  const worker = getWorkerForContext("");
  const context = await new Promise<string>((resolve, reject) => {
    requests.set(id, { resolve, reject });
    worker.postMessage([id, "buildContext", fh]);
  });
  setWorkerForContext(context, worker);
  return context;
}

export async function execute(
  context: string,
  operations: string[][]
): Promise<string> {
  const id = (requestId++).toString();
  const worker = getWorkerForContext(context);
  return new Promise<string>((resolve, reject) => {
    requests.set(id, { resolve, reject });
    worker.postMessage([id, "execute", context, operations]);
  });
}

export async function setOptions(
  context: string,
  options: any
): Promise<string> {
  const id = (requestId++).toString();
  const worker = getWorkerForContext(context);
  return new Promise<string>((resolve, reject) => {
    requests.set(id, { resolve, reject });
    worker.postMessage([id, "setOptions", context, options]);
  });
}

export async function transform(
  context: string,
  transformation: string
): Promise<string> {
  const id = (requestId++).toString();
  const worker = getWorkerForContext(context);
  return new Promise<string>((resolve, reject) => {
    requests.set(id, { resolve, reject });
    worker.postMessage([id, "transform", context, transformation]);
  });
}

export async function cloneContext(context: string): Promise<string> {
  const id = (requestId++).toString();
  const worker = getWorkerForContext(context);
  const newContext = await new Promise<string>((resolve, reject) => {
    requests.set(id, { resolve, reject });
    worker.postMessage([id, "cloneContext", context]);
  });
  setWorkerForContext(newContext, worker);
  return newContext;
}

export async function destroyContext(context: string): Promise<void> {
  const id = (requestId++).toString();
  const worker = getWorkerForContext(context);
  return new Promise<void>((resolve, reject) => {
    requests.set(id, { resolve, reject });
    worker.postMessage([id, "destroyContext", context]);
  });
}

export async function encode(
  context: string,
  mime: string
): Promise<string | ImageData> {
  const id = (requestId++).toString();
  const worker = getWorkerForContext(context);
  return new Promise<string>((resolve, reject) => {
    requests.set(id, { resolve, reject });
    worker.postMessage([id, "encode", context, mime]);
  });
}

for (const worker of workers) {
  worker.onmessage = (e) => {
    const id = e.data[0] as string;
    if (requests.has(id)) {
      const { resolve, reject } = requests.get(id)!;
      if (e.data[1].error) {
        reject(e.data[1].error);
      } else {
        resolve(e.data[1].res);
      }
    }
  };
}
