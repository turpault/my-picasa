import { readFile, writeFile } from "fs/promises";
import { join } from "path";
import ini from "../../../shared/lib/ini.js";
import { sleep } from "../../../shared/lib/utils.js";
import {
  Album,
  AlbumEntry,
  PicasaFileMeta,
  PicasaFolderMeta,
} from "../../../shared/types/types.js";
import { imagesRoot, PICASA } from "../../utils/constants.js";
import { broadcast } from "../../utils/socketList.js";
import { rate } from "../../utils/stats.js";

let picasaMap: Map<string, Promise<PicasaFolderMeta>> = new Map();
let dirtyPicasaMap: Map<string, PicasaFolderMeta> = new Map();

export async function picasaInitCleaner() {
  while (true) {
    const i = dirtyPicasaMap;
    dirtyPicasaMap = new Map();
    i.forEach(async (value, key) => {
      rate("writePicasa");
      console.info(`Writing file ${join(imagesRoot, key, PICASA)}`);
      picasaMap.delete(key);
      const out = ini.encode(value);
      await writeFile(join(imagesRoot, key, PICASA), out);
    });
    await sleep(10);
  }
}

export async function readPicasaIni(album: Album): Promise<PicasaFolderMeta> {
  // In the dirty list
  if (dirtyPicasaMap.has(album.key)) {
    return dirtyPicasaMap.get(album.key)!;
  }

  // In the cache
  if (!picasaMap.has(album.key)) {
    rate("readPicasa");
    picasaMap.set(
      album.key,
      await readFile(join(imagesRoot, album.key, PICASA), {
        encoding: "utf8",
      })
        .then(ini.parse)
        .catch((e) => {
          console.warn(e);
          return {};
        })
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

export async function readPicasaEntry(
  entry: AlbumEntry
): Promise<PicasaFileMeta> {
  return readPicasaIni(entry.album).then((picasa) => {
    picasa[entry.name] = picasa[entry.name] || ({} as PicasaFileMeta);
    return picasa[entry.name];
  });
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
    // Special 'star'
    if ((field as string) === "*") {
      picasa[entry.name] = value;
    } else {
      picasa[entry.name][field] = value as never;
    }
    broadcast("picasaFileMetaChanged", { entry, picasa: picasa[entry.name] });
    return writePicasaIni(entry.album, picasa);
  });
}
