
import { readFile, writeFile } from "fs/promises";
import { join } from "path";
import ini from "../../../shared/lib/ini";
import {
  Album,
  AlbumEntry,
  PicasaFileMeta,
  PicasaFolderMeta
} from "../../../shared/types/types";
import { imagesRoot } from "../../utils/constants";

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
