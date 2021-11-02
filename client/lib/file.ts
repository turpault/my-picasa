import { File } from "./handles";

export async function getFileContents(fh: File): Promise<string | ArrayBuffer> {
  const res = await fh.getFileContents();
  return res;
}
