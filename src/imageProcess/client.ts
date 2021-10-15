import { PicasaFileMeta } from "../folder-utils";

let worker = new Worker("dist/src/imageProcess/worker.js", {
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
