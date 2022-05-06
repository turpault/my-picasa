import { readFileSync } from "fs";
import { readFile, writeFile } from "fs/promises";
import { join } from "path";
import ini from "../../../shared/lib/ini";
import { isPicture, isVideo, lock, sleep } from "../../../shared/lib/utils";
import {
  Album,
  AlbumEntry,
  PicasaFileMeta,
  PicasaFolderMeta,
} from "../../../shared/types/types";
import { imagesRoot, PICASA } from "../../utils/constants";
import { broadcast } from "../../utils/socketList";
import { rate } from "../../utils/stats";
import { imageInfo } from "../imageOperations/info";
import { exifData, exifDataAndStats } from "./exif";
import { folder } from "./fs";
import { media } from "./walker";

let picasaMap: Map<string, PicasaFolderMeta> = new Map();
let dirtyPicasaSet: Set<string> = new Set();
let faces: Map<string, string> = new Map();
export async function picasaInitCleaner() {
  while (true) {
    const i = dirtyPicasaSet;
    dirtyPicasaSet = new Set();
    i.forEach(async (key) => {
      rate("writePicasa");
      console.info(`Writing file ${join(imagesRoot, key, PICASA)}`);
      const out = ini.encode(picasaMap.get(key));
      await writeFile(join(imagesRoot, key, PICASA), out);
    });
    picasaMap.clear();
    await sleep(10);
  }
}

export async function sortAlbum(album: Album, order:string): Promise<void> {
  const i = await readPicasaIni(album);
  const files = await folder(album.key);

  switch(order) {
    case "date":
      {
        const infos = await Promise.all(files.map(file => exifDataAndStats({album, name: file.name}).then(exif=>({exif, entry:{album, name: file.name}}))));
        const sorted = infos.sort((e1, e2) => {
          if(e1.exif.tags.DateTime && e2.exif.tags.DateTime)
            return e1.exif.tags.DateTime - e2.exif.tags.DateTime
          if(!e1.exif.tags.DateTime && !e2.exif.tags.DateTime)
            return e1.exif.stats.ctime.getTime() - e2.exif.stats.ctime.getTime();
            if(!e1.exif.tags.DateTime)
              return e1.exif.stats.ctime.getTime() - e2.exif.tags.DateTime;
              return e1.exif.tags.DateTime - e2.exif.stats.ctime.getTime();
        });
        sorted.forEach((sortedEntry, index) => {
          updatePicasaEntry(sortedEntry.entry, "rank", index);
        });
      }
      break;
  }
}

export async function setRank(entry: AlbumEntry, rank:Number): Promise<void> {
  const ini = await readPicasaIni(entry.album);

  const sortedAndFiltered = Object.entries(ini).sort((a,b) => parseInt(a[1].rank||'0') - parseInt(b[1].rank||'0')).filter(v => v[0] != entry.name);
  let rankIndex = 0;
  for(const [name, i] of sortedAndFiltered) {
    if(rankIndex === rank) {
      rankIndex++;
    }
    updatePicasaEntry({album: entry.album, name}, "rank", rankIndex);
    rankIndex++;
  }
  updatePicasaEntry(entry, "rank", rank);
}

async function assignRanks(album: Album, ini: PicasaFolderMeta): Promise<void> {
  const filesInFolder = await media(album, '');
  let rank = 0;
  for(const f of filesInFolder.assets) {
    const entry = {album, name: f.name};
    if(isPicture(entry) || isVideo(entry)) {
      if(!ini[f.name] || ini[f.name].rank === undefined) {
        updatePicasaEntry(entry, "rank", rank++);
      }
      else if(ini[f.name].rank === undefined || parseInt(ini[f.name].rank!) <= rank) {
        updatePicasaEntry(entry, "rank", rank++);
      }
    }
  }
}

export async function readPicasaIni(album: Album): Promise<PicasaFolderMeta> {
  // In the cache
  const filename = join(imagesRoot, album.key, PICASA);
  // TODO: check for file modified date
  if (!picasaMap.has(album.key)) {
    rate("readPicasa");
    const l = await lock("readPicasaIni:" + album.key);
    try {
      const iniData = await readFile(filename, {
        encoding: "utf8",
      });
      const i = ini.parse(iniData);
      picasaMap.set(album.key, i);
      if (i.Contacts2) {
        // includes a map of faces/ids
        for (const [id, name] of Object.entries(
          i.Contacts2 as { [key: string]: string }
        )) {
          if (!faces.has(id)) {
            faces.set(id, name);
          }
        }
      }
    } catch (e: any) {
      console.warn(e);
      picasaMap.set(album.key, {});
    }
    l();
    await assignRanks(album, picasaMap.get(album.key)!);
  }
  return picasaMap.get(album.key)!;
}

export async function fullTextSearch(
  album: Album,
  filter: string
): Promise<AlbumEntry[]> {
  let data = { ...(await readPicasaIni(album)) };

  const faceIds: string[] = [];
  for (const [id, val] of faces.entries()) {
    if (val.toLowerCase().includes(filter)) {
      faceIds.push(id);
    }
  }
  const res: AlbumEntry[] = [];
  Object.entries(data).forEach(([name, picasaEntry]) => {
    if (name.toLowerCase().includes(filter)) {
      res.push({ album, name });
      return;
    }
    if (album.name.toLowerCase().includes(filter)) {
      res.push({ album, name });
      return;
    }
    if (picasaEntry.faces) {
      for (const id of faceIds) {
        if (picasaEntry.faces.includes(id)) {
          res.push({ album, name });
          return;
        }
      }
    }
  });
  if (res.length > 0) {
  }
  return res;
}


function writePicasaIni(album: Album, data: PicasaFolderMeta): void {
  dirtyPicasaSet.add(album.key);
  picasaMap.set(album.key, data);
}

export async function readPicasaEntry(
  entry: AlbumEntry
): Promise<PicasaFileMeta> {
  const picasa = await readPicasaIni(entry.album);
  picasa[entry.name] = picasa[entry.name] || ({} as PicasaFileMeta);
  return picasa[entry.name];
}

export async function touchPicasaEntry(entry: AlbumEntry) {
  const picasa = await readPicasaIni(entry.album);
  if (picasa[entry.name] === undefined) {
    picasa[entry.name] = {} as PicasaFileMeta;
    writePicasaIni(entry.album, picasa);
  }
}

export async function updatePicasaEntry(
  entry: AlbumEntry,
  field: keyof PicasaFileMeta | "*",
  value: any
) {
  const picasa = await readPicasaIni(entry.album);
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
    if (value) {
      picasa[entry.name][field as keyof PicasaFileMeta] = value as never;
    } else {
      delete picasa[entry.name][field as keyof PicasaFileMeta];
    }
  }

  if (["filters", "caption", "text", "rotate", "star"].includes(field)) {
    broadcast("picasaFileMetaChanged", { entry, picasa: picasa[entry.name] });
  }
  return writePicasaIni(entry.album, picasa);
}
