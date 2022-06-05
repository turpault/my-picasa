import { stat } from "fs/promises";
import { join } from "path";
import { AlbumEntry } from "../../shared/types/types";
import { imagesRoot } from "./constants";

export async function fileExists(path: string): Promise<boolean> {
  return stat(path)
    .then(() => true)
    .catch(() => false);
}

export function entryFilePath(entry: AlbumEntry) {
  return join(imagesRoot, entry.album.key, entry.name);
}
