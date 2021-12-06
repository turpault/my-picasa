import { readFileSync } from "fs";
import { readFile, writeFile } from "fs/promises";
import { join } from "path";
import ini from "../../../shared/lib/ini";
import { sleep } from "../../../shared/lib/utils";
import {
  Album,
  AlbumEntry,
  PicasaFileMeta,
  PicasaFolderMeta,
} from "../../../shared/types/types";
import { imagesRoot, PICASA } from "../../utils/constants";
import { broadcast } from "../../utils/socketList";
import { rate } from "../../utils/stats";

let picasaMap: Map<string, PicasaFolderMeta> = new Map();
let dirtyPicasaSet: Set<string> = new Set();

export async function picasaInitCleaner() {
  while (true) {
    const i = dirtyPicasaSet;
    dirtyPicasaSet = new Set();
    i.forEach(async (key) => {
      rate("writePicasa");
      console.info(`Writing file ${join(imagesRoot, key, PICASA)}`);
      const out = ini.encode(picasaMap.get(key));
      picasaMap.delete(key);
      await writeFile(join(imagesRoot, key, PICASA), out);
    });
    await sleep(10);
  }
}

export function readPicasaIni(album: Album): PicasaFolderMeta {
  // In the cache
  if (!picasaMap.has(album.key)) {
    rate("readPicasa");
    try {
      const iniData = readFileSync(join(imagesRoot, album.key, PICASA), {
        encoding: "utf8",
      });
      const i = ini.parse(iniData);
      picasaMap.set(album.key, i);
    } catch (e: any) {
      console.warn(e);
      picasaMap.set(album.key, {});
    }
  }
  return picasaMap.get(album.key)!;
}

function writePicasaIni(album: Album, data: PicasaFolderMeta): void {
  dirtyPicasaSet.add(album.key);
  picasaMap.set(album.key, data);
}

export function readPicasaEntry(entry: AlbumEntry): PicasaFileMeta {
  const picasa = readPicasaIni(entry.album);
  picasa[entry.name] = picasa[entry.name] || ({} as PicasaFileMeta);
  return picasa[entry.name];
}

export function updatePicasaEntry(
  entry: AlbumEntry,
  field: keyof PicasaFileMeta | "*",
  value: any
) {
  const picasa = readPicasaIni(entry.album);
  picasa[entry.name] = picasa[entry.name] || ({} as PicasaFileMeta);
  if (value === "toggle") {
    value = !picasa[entry.name][field as keyof PicasaFileMeta];
  }
  // Special 'star'
  if (field === "*") {
    if (value) {
      picasa[entry.name] = value;
    } else {
      delete picasa[entry.name];
    }
  } else {
    picasa[entry.name][field as keyof PicasaFileMeta] = value as never;
  }
  broadcast("picasaFileMetaChanged", { entry, picasa: picasa[entry.name] });
  return writePicasaIni(entry.album, picasa);
}
