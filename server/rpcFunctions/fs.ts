import { readdir, readFile, stat, writeFile } from "fs/promises";
import { join } from "path";
import { imagesRoot } from "../utils/constants";

export async function readFileContents(file: string): Promise<Buffer> {
  const p = join(imagesRoot, file);
  return await readFile(p);
}

export async function writeFileContents(
  file: string,
  data: object
): Promise<void> {
  return writeFile(join(imagesRoot, file), data as Buffer);
}

export async function folder(
  folder: string
): Promise<{ name: string; kind: string }[]> {
  const p = join(imagesRoot, folder);
  const data = await readdir(p);
  const stats = await Promise.allSettled(
    data.map((e) =>
      stat(join(p, e)).then((s) => ({
        name: e,
        kind: s.isDirectory() ? "directory" : "file",
      }))
    )
  );
  return stats
    .filter((p) => p.status === "fulfilled")
    .map((p) => (p as any).value);
}
