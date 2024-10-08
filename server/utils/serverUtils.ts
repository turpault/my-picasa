import { rename, stat, writeFile } from "fs/promises";
import { extname, join } from "path";
import { lock } from "../../shared/lib/mutex";
import { AlbumEntry, AlbumKind, idFromKey } from "../../shared/types/types";
import { facesFolder, imagesRoot, projectFolder } from "./constants";

export async function fileExists(path: string): Promise<boolean> {
  return stat(path)
    .then(() => true)
    .catch(() => false);
}

export function entryFilePath(entry: AlbumEntry) {
  let root = imagesRoot;
  return join(root, idFromKey(entry.album.key).id, entry.name);
}

export function mediaName(entry: AlbumEntry): string {
  return removeExtension(entry.album.name + " - " + entry.name);
}

export function removeExtension(fileName: string) {
  return fileName.slice(0, -extname(fileName).length);
}

export async function safeWriteFile(fileName: string, data: any) {
  const unlock = await lock("safeWriteFile: " + fileName);
  try {
    const tmp = fileName + ".tmp";
    await writeFile(tmp, data);
    await rename(tmp, fileName);
  } catch (e) {
    console.warn(`Could not save ${fileName}: ${e}`);
  } finally {
    unlock();
  }
}
