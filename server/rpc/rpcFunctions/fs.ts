import { mkdir, readdir, readFile, stat } from "fs/promises";
import { join } from "path";
import {
  Album,
  AlbumEntry,
  AlbumKind,
  idFromKey,
  keyFromID,
} from "../../../shared/types/types";
import {
  defaultNewFolder,
  imagesRoot,
  specialFolders,
} from "../../utils/constants";
import { safeWriteFile } from "../../utils/serverUtils";
import { openWithFinder } from "./osascripts";
import { addOrRefreshOrDeleteAlbum } from "../../walker";
import { pathForAlbum, pathForAlbumEntry } from "../../utils/serverUtils";

export async function getFileContents(file: string): Promise<string> {
  const p = join(imagesRoot, file);
  return await readFile(p, { encoding: "utf-8" });
}

export async function writeFileContents(
  file: string,
  data: string,
): Promise<void> {
  return safeWriteFile(join(imagesRoot, file), data);
}

export async function folder(
  folder: string,
): Promise<{ name: string; kind: "directory" | "file" }[]> {
  const p = join(imagesRoot, folder);
  const data = await readdir(p);
  const stats = await Promise.allSettled(
    data.map((e) =>
      stat(join(p, e)).then((s) => ({
        name: e,
        kind: s.isDirectory() ? "directory" : "file",
      })),
    ),
  );
  return stats
    .filter((p) => p.status === "fulfilled")
    .map((p) => (p as any).value);
}

export async function makeAlbum(name: string): Promise<Album> {
  const p = join(imagesRoot, defaultNewFolder, name);
  return stat(p)
    .catch((e) => mkdir(p, { recursive: true }))
    .then(() => {
      const a: Album = {
        key: keyFromID(join(defaultNewFolder, name), AlbumKind.FOLDER),
        name,
        kind: AlbumKind.FOLDER,
      };
      addOrRefreshOrDeleteAlbum(a, undefined, true);
      return a;
    });
}

export async function openAlbumInFinder(album: Album) {
  const p = join(imagesRoot, pathForAlbum(album));
  openWithFinder(p);
}

export async function openAlbumEntryInFinder(entry: AlbumEntry) {
  const p = join(imagesRoot, pathForAlbumEntry(entry));
  openWithFinder(p);
}

export async function walk(
  folder: string,
  cb: (path: string, modificationTime: Date) => void,
) {
  const promises: Promise<void>[] = [];
  const p = join(imagesRoot, folder);
  const data = await readdir(p);
  for (const f of data) {
    if (!f.startsWith(".")) {
      const s = await stat(join(p, f));
      if (s.isDirectory()) {
        if (!specialFolders.includes(f)) {
          promises.push(walk(join(folder, f), cb));
        }
      } else {
        cb(join(folder, f), s.mtime);
      }
    }
  }
  return Promise.all(promises).then(() => void 0);
}
