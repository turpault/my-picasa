import { stat } from "fs/promises";
import { join } from "path";
import { AlbumEntry } from "../../shared/types/types";
import { imagesRoot } from "./constants";
import { extname } from "path";

export async function fileExists(path: string): Promise<boolean> {
  return stat(path)
    .then(() => true)
    .catch(() => false);
}

export function entryFilePath(entry: AlbumEntry) {
  return join(imagesRoot, entry.album.key, entry.name);
}

export function mediaName(entry: AlbumEntry): string {
  return removeExtension(entry.album.name + ' - ' + entry.name);
}

export function removeExtension(fileName:string) {
  return fileName.slice(0, -extname(fileName).length);
}