import { readFile, stat, writeFile } from "fs/promises";
import { join } from "path";
import ini from "../../../shared/lib/ini";
import { lock, removeDiacritics, sleep } from "../../../shared/lib/utils";
import {
  Album,
  AlbumEntry,
  PicasaFileMeta,
  PicasaFolderMeta,
  PicasaSection
} from "../../../shared/types/types";
import { imagesRoot, PICASA } from "../../utils/constants";
import { broadcast } from "../../utils/socketList";
import { rate } from "../../utils/stats";
import { media } from "./media";
import { addOrRefreshOrDeleteAlbum } from "./walker";

let picasaMap = new Map<string, PicasaFolderMeta>();
let lastAccessPicasaMap = new Map<string, number>();
let dirtyPicasaSet =  new Set<string>();
let faces = new Map<string, {name: string; email:string; something: string}>();
let shortcuts: {[shotcut:string]: Album} = {};
const GRACE_DELAY = 120000;
export async function picasaIniCleaner() {
  while (true) {
    const i = dirtyPicasaSet;
    dirtyPicasaSet = new Set();
    i.forEach(async (key) => {
      rate("writePicasa");
      console.info(`\nWriting file ${join(imagesRoot, key, PICASA)}`);
      const out = ini.encode(picasaMap.get(key));
      await writeFile(join(imagesRoot, key, PICASA), out);
    });
    picasaMap.forEach((value, key) => {
      const lastAccess = lastAccessPicasaMap.get(key);
      if(!lastAccess || (Date.now() - lastAccess) > GRACE_DELAY) {
        picasaMap.delete(key);
        lastAccessPicasaMap.delete(key);
      }
    });
    await sleep(10);
  }
}
export async function readPicasaIni(album: Album): Promise<PicasaFolderMeta> {
  lastAccessPicasaMap.set(album.key, Date.now());
  if (picasaMap.has(album.key)) {
    return picasaMap.get(album.key)!;
  }
  rate("readPicasa");
  const l = await lock(`readPicasaIni: ${album.key}`);
  if (picasaMap.has(album.key)) {
    l();
    return picasaMap.get(album.key)!;
  }
  try {
    await stat(join(imagesRoot, album.key));
  } catch(e) {
    l();
    throw e;
  }
  try {
    // In the cache
    const filename = join(imagesRoot, album.key, PICASA);
    const iniData = await readFile(filename, {
      encoding: "utf8",
    });
    const i = ini.parse(iniData);
    picasaMap.set(album.key, i);
    if (i.Contacts2) {
      // includes a map of faces/ids
      for (const [id, value] of Object.entries(
        i.Contacts2 as { [key: string]: string }
      )) {
        if (!faces.has(id)) {
          const [name, email, something] = value.split(';');
          faces.set(id, {name, email, something});
        }
      }
    }
    if(i.shortcut !== undefined) {
      shortcuts[i.shortcut] =  album;
    }
  } catch (e: any) {
    picasaMap.set(album.key, {});
  }
  l();
  const res =  await readPicasaIni(album);
  return res;
}

export async function albumInFilter(
  album: Album,
  normalizedFilter: string
): Promise<AlbumEntry[]> {

  if(removeDiacritics(album.name).toLowerCase().includes(normalizedFilter)) {
    return (await media(album)).entries;
  }
  return [];

  let data = { ...(await readPicasaIni(album)) };

  const faceIds: string[] = [];
  for (const [id, val] of faces.entries()) {
    if (val.name.toLowerCase().includes(normalizedFilter)) {
      faceIds.push(id);
    }
  }
  const res: AlbumEntry[] = [];
  Object.entries(data).forEach(([name, picasaEntry]) => {
    if (name.toLowerCase().includes(normalizedFilter)) {
      res.push({ album, name });
      return;
    }
    if (album.name.toLowerCase().includes(normalizedFilter)) {
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
  lastAccessPicasaMap.set(album.key, Date.now());
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

export async function readPicasaSection(
  album: Album,
  section: string= "Picasa"
): Promise<PicasaSection> {
  const picasa = await readPicasaIni(album);
  picasa[section] = picasa[section] || {};
  return picasa[section] as PicasaSection;
}

export async function touchPicasaEntry(entry: AlbumEntry) {
  const picasa = await readPicasaIni(entry.album);
  if (picasa[entry.name] === undefined) {
    picasa[entry.name] = {} as PicasaFileMeta;
    writePicasaIni(entry.album, picasa);
  }
}

export function getFaces() {
  return faces;
}

export async function setAlbumShortcut(album: Album, shortcut: string) {
  const section = await readPicasaSection(album);
  if(section.shortcut) {
    delete shortcuts[section.shortcut];
  }
  if(shortcut && shortcuts[shortcut]) {
    setAlbumShortcut(shortcuts[shortcut], '');
  }
  if(shortcut) {
    shortcuts[shortcut] = album;
  }
  broadcast('albumEvent', [{type: "shortcutsUpdated"}]);
  return updatePicasa(album, 'shortcut', shortcut);
}

export function getShortcuts() {
  return shortcuts;
}

export async function updatePicasa(
  album: Album,
  field: string,
  value: string,
  group: string = "Picasa",
) {
  const picasa = await readPicasaIni(album);
  const section = picasa[group] = (picasa[group] || {}) as PicasaSection;
  section[field] = value;
  addOrRefreshOrDeleteAlbum(album);
  return writePicasaIni(album, picasa);
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
    if (value !== undefined) {
      picasa[entry.name][field as keyof PicasaFileMeta] = value.toString() as never;
    } else {
      delete picasa[entry.name][field as keyof PicasaFileMeta];
    }
  }

  if (["filters", "caption", "text", "rotate", "star"].includes(field)) {
    broadcast("picasaFileMetaChanged", { entry, picasa: picasa[entry.name] });
  }
  return writePicasaIni(entry.album, picasa);
}
