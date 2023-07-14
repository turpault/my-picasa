import { readFile } from "fs/promises";
import { join } from "path";
import ini from "../../../shared/lib/ini";
import { MAX_STAR } from "../../../shared/lib/shared-constants";
import {
  decodeOperations,
  encodeOperations,
  lock,
  removeDiacritics,
  sleep,
} from "../../../shared/lib/utils";
import {
  Album,
  AlbumEntry,
  AlbumEntryMetaData,
  AlbumKind,
  AlbumMetaData,
  PicasaSection,
  idFromKey,
} from "../../../shared/types/types";
import { PICASA, imagesRoot } from "../../utils/constants";
import { safeWriteFile } from "../../utils/serverUtils";
import { broadcast } from "../../utils/socketList";
import { rate } from "../../utils/stats";
import { media } from "./albumUtils";

let picasaMap = new Map<string, AlbumMetaData>();
let lastAccessPicasaMap = new Map<string, number>();
let dirtyPicasaSet = new Map<string, Album>();
let shortcuts: { [shotcut: string]: Album } = {};
const GRACE_DELAY = 120000;

export async function picasaIniCleaner() {
  while (true) {
    const i = dirtyPicasaSet;
    dirtyPicasaSet = new Map<string, Album>();
    i.forEach(async (album) => {
      let target: string = "";
      if (album.kind === AlbumKind.FOLDER) {
        target = join(imagesRoot, idFromKey(album.key).id, PICASA);
      } else {
        target = join(imagesRoot, "." + idFromKey(album.key).id + ".ini");
      }
      rate("writePicasa");
      console.info(`\nWriting file ${target}`);
      const out = ini.encode(picasaMap.get(album.key));
      await safeWriteFile(target, out);
    });
    picasaMap.forEach((value, key) => {
      if (dirtyPicasaSet.has(key)) {
        return;
      }
      const lastAccess = lastAccessPicasaMap.get(key);
      if (!lastAccess || Date.now() - lastAccess > GRACE_DELAY) {
        picasaMap.delete(key);
        lastAccessPicasaMap.delete(key);
      }
    });
    await sleep(10);
  }
}

export async function readAlbumEntries(album: Album): Promise<AlbumEntry[]> {
  const data = await readAlbumIni(album);
  return Object.keys(data).map((key) => ({
    album,
    name: key,
  }));
}

export async function readAlbumIni(album: Album): Promise<AlbumMetaData> {
  lastAccessPicasaMap.set(album.key, Date.now());
  if (picasaMap.has(album.key)) {
    return picasaMap.get(album.key)!;
  }
  rate("readAlbumIni");
  const l = await lock(`readAlbumIni: ${album.key}`);
  try {
    if (picasaMap.has(album.key)) {
      return picasaMap.get(album.key)!;
    }
    let target: string = "";
    if (album.kind === AlbumKind.FOLDER) {
      target = join(imagesRoot, idFromKey(album.key).id, PICASA);
    } else {
      target = join(imagesRoot, "." + idFromKey(album.key).id + ".ini");
    }
    // Not in the map, read it
    const iniData = await readFile(target, {
      encoding: "utf8",
    });
    const i = ini.parse(iniData);
    // Read&fix data
    if (album.kind === AlbumKind.FOLDER) {
      if (i.Picasa && i.Picasa.name && i.Picasa.name !== album.name) {
        i.Picasa.name = album.name;
      }
      for (const key in i) {
        if (i[key]["star"] && i[key]["starCount"] === undefined) {
          i[key]["starCount"] = "1";
        }
      }
    }
    if (i?.Picasa?.shortcut !== undefined && !shortcuts[i.Picasa.shortcut]) {
      shortcuts[i.Picasa.shortcut] = album;
      broadcast("shortcutsUpdated", {});
    }

    picasaMap.set(album.key, i);
    return i;
  } catch (e: any) {
    console.error(`Error reading .ini file: ${e.message}`);
    const res = {};
    picasaMap.set(album.key, res);
    return res;
  } finally {
    l();
  }
}

export async function albumInFilter(
  album: Album,
  normalizedFilter: string
): Promise<AlbumEntry[]> {
  if (removeDiacritics(album.name).toLowerCase().includes(normalizedFilter)) {
    return (await media(album)).entries;
  }
  return [];
}

function writePicasaIni(album: Album, data: AlbumMetaData): void {
  lastAccessPicasaMap.set(album.key, Date.now());
  dirtyPicasaSet.set(album.key, album);
  picasaMap.set(album.key, data);
}

export async function readPicasaEntry(
  entry: AlbumEntry
): Promise<AlbumEntryMetaData> {
  const picasa = await readAlbumIni(entry.album);
  picasa[entry.name] = picasa[entry.name] || ({} as AlbumEntryMetaData);
  return picasa[entry.name];
}

async function readPicasaSection(
  album: Album,
  section: string = "Picasa"
): Promise<PicasaSection> {
  if (album.kind === AlbumKind.FOLDER) {
    const picasa = await readAlbumIni(album);
    picasa[section] = picasa[section] || {};
    return picasa[section] as PicasaSection;
  } else
    return {
      shortcut: "",
    };
}

export async function readShortcut(album: Album): Promise<string | undefined> {
  const section = await readPicasaSection(album);
  return section.shortcut || undefined;
}

export async function touchPicasaEntry(entry: AlbumEntry) {
  if (entry.name.normalize() !== entry.name) {
    debugger;
  }
  const picasa = await readAlbumIni(entry.album);
  if (picasa[entry.name] === undefined) {
    picasa[entry.name] = {} as AlbumEntryMetaData;
    writePicasaIni(entry.album, picasa);
  }
}

export async function setPicasaAlbumShortcut(album: Album, shortcut: string) {
  const section = await readPicasaSection(album);
  // Remove any existing shortcut for that album
  if (section.shortcut) {
    delete shortcuts[section.shortcut];
    updatePicasa(album, "shortcut", null);
  }
  // If that shortcut is already assigned, remove it
  if (shortcut && shortcuts[shortcut]) {
    await setPicasaAlbumShortcut(shortcuts[shortcut], "");
  }
  // Now assign it to this album
  if (shortcut) {
    shortcuts[shortcut] = album;
    updatePicasa(album, "shortcut", shortcut);
  }
  return;
}

export function getShortcuts() {
  return shortcuts;
}

export async function rotate(entries: AlbumEntry[], direction: string) {
  const increment =
    {
      left: 1,
      right: 3,
    }[direction] || 0;
  for (const entry of entries) {
    const picasa = await readPicasaEntry(entry);
    const operations = decodeOperations(picasa.filters || "");
    const idx = operations.findIndex((o) => o.name === "rotate");
    let initialValue = 0;
    if (idx !== -1) {
      initialValue = parseInt(operations[idx].args[1]);
    }
    initialValue += increment;
    const newCommand = { name: "rotate", args: ["1", initialValue.toString()] };
    if (idx !== -1) {
      if (initialValue % 4 === 0) {
        operations.splice(idx, 1);
      } else {
        operations[idx] = newCommand;
      }
    } else {
      operations.push(newCommand);
    }
    updatePicasaEntry(entry, "filters", encodeOperations(operations));
  }
}

export async function toggleStar(entries: AlbumEntry[]) {
  for (const entry of entries) {
    const picasa = await readPicasaEntry(entry);
    let star = picasa.star;
    let starCount: string | undefined = picasa.starCount || "1";
    if (!star) {
      star = true;
      starCount = "1";
    } else {
      starCount = (parseInt(starCount) + 1).toString();
    }
    if (parseInt(starCount) >= MAX_STAR) {
      starCount = undefined;
      star = undefined;
    }
    updatePicasaEntries(entry, { star, starCount });
  }
}

export async function updatePicasa(
  album: Album,
  field: string | null,
  value: string | null,
  group: string = "Picasa"
) {
  if (group.normalize() !== group) {
    debugger;
  }
  const picasa = await readAlbumIni(album);
  const section = (picasa[group] = (picasa[group] || {}) as PicasaSection);
  if (value !== null && field !== null) {
    if (section[field] === value) {
      // no change
      return;
    }
    section[field] = value;
  } else if (field !== null) {
    if (section[field]) {
      delete section[field];
    }
  } else {
    delete picasa[group];
  }
  await writePicasaIni(album, picasa);
}

export async function updatePicasaEntry(
  entry: AlbumEntry,
  field: keyof AlbumEntryMetaData | "*",
  value: any
) {
  if (entry.name.normalize() !== entry.name) {
    debugger;
  }
  const picasa = await readAlbumIni(entry.album);
  picasa[entry.name] = picasa[entry.name] || ({} as AlbumEntryMetaData);
  if (value === "toggle") {
    value = !picasa[entry.name][field as keyof AlbumEntryMetaData];
  }
  // Special 'star'
  if (field === "*") {
    if (value) {
      picasa[entry.name] = value;
    } else {
      delete picasa[entry.name];
    }
  } else {
    if (value !== undefined && value !== null) {
      picasa[entry.name][
        field as keyof AlbumEntryMetaData
      ] = value.toString() as never;
    } else {
      delete picasa[entry.name][field as keyof AlbumEntryMetaData];
    }
  }

  if (["filters", "caption", "rotate", "star", "starCount"].includes(field)) {
    broadcast("albumEntryAspectChanged", {
      ...entry,
      metadata: picasa[entry.name],
    });
  }
  writePicasaIni(entry.album, picasa);
}

export async function updatePicasaEntries(
  entry: AlbumEntry,
  kv: AlbumEntryMetaData
) {
  const picasa = await readAlbumIni(entry.album);
  let dirty = false;
  let doBroadcast = false;
  if (entry.name.normalize() !== entry.name) {
    debugger;
  }
  picasa[entry.name] = picasa[entry.name] || ({} as AlbumEntryMetaData);
  for (const k of Object.keys(kv) as (keyof AlbumEntryMetaData)[]) {
    if (kv[k] !== undefined && kv[k] !== null) {
      if (kv[k] !== picasa[entry.name][k]) {
        picasa[entry.name][k] = kv[k]!.toString();
        dirty = true;
      }
    } else {
      delete picasa[entry.name][k];
    }
    if (
      dirty &&
      ["filters", "caption", "rotate", "star", "starCount"].includes(k)
    ) {
      doBroadcast = true;
    }
  }

  if (doBroadcast) {
    broadcast("albumEntryAspectChanged", {
      ...entry,
      metadata: picasa[entry.name],
    });
  }
  if (dirty) writePicasaIni(entry.album, picasa);
}
