import { rename, stat, writeFile } from "fs/promises";
import { extname, join } from "path";
import { lock } from "../../shared/lib/mutex";
import {
  Album,
  AlbumEntry,
  AlbumKind,
  idFromKey,
} from "../../shared/types/types";
import { imagesRoot } from "./constants";

export async function fileExists(path: string): Promise<boolean> {
  return stat(path)
    .then(() => true)
    .catch(() => false);
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


export function entryFilePath(entry: AlbumEntry) {
  let root = imagesRoot;
  return join(root, idFromKey(entry.album.key).id, entry.name);
}

export function pathAndFileForAlbumEntry(entry: AlbumEntry) {
  return {
    path: [pathForAlbum(entry.album)],
    filename: entry.name,
  };
}

export function pathForAlbumEntry(entry: AlbumEntry) {
  return join(pathForAlbum(entry.album), entry.name);
}

export function pathForAlbum(album: Album) {
  const { id, kind } = idFromKey(album.key);
  if (kind === AlbumKind.FOLDER) {
    return id;
  } else throw new Error("Not a folder");
}

