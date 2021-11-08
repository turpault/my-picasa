import { readdir, readFile, stat, writeFile } from "fs/promises";
import { join } from "path";
import {
  Album,
  AlbumEntry,
  PicasaFileMeta,
  PicasaFolderMeta,
} from "../../../shared/types/types";
import { imagesRoot } from "../../utils/constants";
import ini from "../../../shared/lib/ini";

export async function readFileContents(file: string): Promise<string> {
  const p = join(imagesRoot, file);
  return await readFile(p, { encoding: "utf-8" });
}

export async function writeFileContents(
  file: string,
  data: string
): Promise<void> {
  return writeFile(join(imagesRoot, file), data);
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

let picasaMap: Map<string, Promise<PicasaFolderMeta>> = new Map();
let dirtyPicasaMap: Map<string, PicasaFolderMeta> = new Map();

setInterval(async () => {
  const i = dirtyPicasaMap;
  dirtyPicasaMap = new Map();
  i.forEach(async (value, key) => {
    console.info(`Writing file ${join(imagesRoot, key, ".picasa.ini")}`);
    picasaMap.delete(key);
    await writeFile(join(imagesRoot, key, ".picasa.ini"), ini.encode(value));
  });
}, 10000);

export async function readPicasaIni(album: Album): Promise<PicasaFolderMeta> {
  // In the dirty list
  if (dirtyPicasaMap.has(album.key)) {
    return dirtyPicasaMap.get(album.key)!;
  }

  // In the cache
  if (!picasaMap.has(album.key)) {
    picasaMap.set(
      album.key,
      await readFile(join(imagesRoot, album.key, ".picasa.ini"), {
        encoding: "utf8",
      }).then(ini.parse)
    );
  }
  return picasaMap.get(album.key)!;
}

export async function writePicasaIni(
  album: Album,
  data: PicasaFolderMeta
): Promise<void> {
  if (!dirtyPicasaMap.has(album.key)) {
    dirtyPicasaMap.set(album.key, data);
  }
}

export async function updatePicasaEntry(
  entry: AlbumEntry,
  field: keyof PicasaFileMeta,
  value: any
) {
  readPicasaIni(entry.album).then((picasa) => {
    picasa[entry.name] = picasa[entry.name] || ({} as PicasaFileMeta);
    if (value === "toggle") {
      value = !picasa[entry.name][field];
    }
    picasa[entry.name][field] = value as never;
    return writePicasaIni(entry.album, picasa);
  });
}
