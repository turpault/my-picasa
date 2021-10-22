import { PicasaFileMeta } from "../types/types";

let worker = new Worker("/dist/src/imageProcess/worker.js", {
  type: "module",
});
let requests: Map<string, { resolve: Function; reject: Function }> = new Map();
let requestId = 0;
export async function readPictureWithTransforms(
  fh: any,
  options: PicasaFileMeta,
  extraOperations: any[]
): Promise<string> {
  const id = (requestId++).toString();
  return new Promise<string>((resolve, reject) => {
    requests.set(id, { resolve, reject });
    worker.postMessage([
      id,
      "readPictureWithTransforms",
      fh,
      options,
      extraOperations,
    ]);
  });
}

export async function buildContext(fh: any): Promise<string> {
  const id = (requestId++).toString();
  return new Promise<string>((resolve, reject) => {
    requests.set(id, { resolve, reject });
    worker.postMessage([id, "buildContext", fh]);
  });
}

export async function transform(
  context: string,
  transformation: string
): Promise<string> {
  const id = (requestId++).toString();
  return new Promise<string>((resolve, reject) => {
    requests.set(id, { resolve, reject });
    worker.postMessage([id, "transform", context, transformation]);
  });
}

export async function cloneContext(context: string): Promise<string> {
  const id = (requestId++).toString();
  return new Promise<string>((resolve, reject) => {
    requests.set(id, { resolve, reject });
    worker.postMessage([id, "cloneContext", context]);
  });
}

export async function destroyContext(context: string): Promise<void> {
  const id = (requestId++).toString();
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
  return new Promise<string>((resolve, reject) => {
    requests.set(id, { resolve, reject });
    worker.postMessage([id, "encode", context, mime]);
  });
}

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
