import { readFile } from "fs/promises";
import { join } from "path";
import ini from "../../../shared/lib/ini";
import { Queue } from "../../../shared/lib/queue";
import { MAX_STAR } from "../../../shared/lib/shared-constants";
import {
  decodeOperations,
  encodeOperations,
  fromBase64,
  lock,
  removeDiacritics,
  sleep,
  toBase64,
} from "../../../shared/lib/utils";
import {
  Album,
  AlbumEntry,
  AlbumEntryMetaData,
  AlbumKind,
  AlbumMetaData,
  AlbumWithData,
  PicasaSection,
  idFromKey,
  keyFromID,
} from "../../../shared/types/types";
import { PICASA, imagesRoot } from "../../utils/constants";
import { safeWriteFile } from "../../utils/serverUtils";
import { broadcast } from "../../utils/socketList";
import { rate } from "../../utils/stats";
import { media } from "./media";

let picasaMap = new Map<string, AlbumMetaData>();
let lastAccessPicasaMap = new Map<string, number>();
let dirtyPicasaSet = new Map<string, Album>();
let faces = new Map<
  string,
  AlbumWithData & { hash: { [key: string]: string } } & { [key: string]: any }
>();
let parsedFaces = new Set<string>();
let shortcuts: { [shotcut: string]: Album } = {};
const GRACE_DELAY = 120000;

function normalizeName(name: string): string {
  return name.toLowerCase().replace(/^[a-z]|[\s|-][a-z]/gi, (s) => {
    return s.toUpperCase();
  });
}

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
      // Parse faces asynchronously
      processFaces(album, i);

      if (i.Picasa && i.Picasa.name && i.Picasa.name !== album.name) {
        i.Picasa.name = album.name;
      }
    }
    if (i?.Picasa?.shortcut !== undefined && !shortcuts[i.Picasa.shortcut]) {
      shortcuts[i.Picasa.shortcut] = album;
      broadcast("shortcutsUpdated", {});
    }

    picasaMap.set(album.key, i);
  } catch (e: any) {
    console.error(`Error reading .ini file: ${e.message}`);
    picasaMap.set(album.key, {});
  } finally {
    l();
  }
  // If we get there, we either read the ini, or created a new one, return it
  const res = await readAlbumIni(album);
  return res;
}

export function getFaceAlbumFromHash(
  hash: string
): { album: AlbumWithData | undefined; hash: string } {
  for (const face of faces.values()) {
    if (face.hash[hash] !== undefined) {
      return { album: face, hash };
    }
  }
  return { album: undefined, hash };
}

// Limit the parallelism for the face parsing
const faceProcessingQueue = new Queue();
async function processFaces(album: Album, picasaIni: AlbumMetaData) {
  if (parsedFaces.has(album.key)) {
    return;
  }
  parsedFaces.add(album.key);
  return faceProcessingQueue.add(async () => {
    const localhashes: { [hash: string]: AlbumWithData } = {};
    if (picasaIni.Contacts2) {
      // includes a map of faces/ids
      for (const [hash, value] of Object.entries(
        picasaIni.Contacts2 as { [key: string]: string }
      )) {
        const [originalName, email, something] = value.split(";");
        const name = normalizeName(originalName);

        const key = keyFromID(name, AlbumKind.FACE);
        if (!faces.has(key)) {
          faces.set(key, {
            key,
            name,
            count: 0,
            hash: {},
            email,
            something,
            originalName,
            kind: AlbumKind.FACE,
          });
        }
        faces.get(key)!.hash[hash] = "";
        localhashes[hash] = faces.get(key)!;
      }
    }

    for (const section of Object.keys(picasaIni)) {
      const iniFaces = picasaIni[section].faces;
      if (iniFaces) {
        // Example:faces=rect64(9bff22f6ad443ebb),d04ca592f8868c2;rect64(570c6e79670c8820),4f3f1b40e69b2537;rect64(b8512924c7ae41f2),69618ff17d8c570f
        for (const face of iniFaces.split(";")) {
          const [rect, id] = face.split(",");
          const faceAlbum = localhashes[id];
          if (faceAlbum) {
            faceAlbum.count++;
            const sectionName = toBase64(
              JSON.stringify([album.key, section, rect, id])
            );
            updatePicasa(faceAlbum, "album", album.key, sectionName);
            updatePicasa(faceAlbum, "key", section, sectionName);
          }
        }
      }
    }
  });
}

export function getFaceAlbums(): AlbumWithData[] {
  return Array.from(faces.values());
}

export async function getFaceData(entry: AlbumEntry) {
  const [albumKey, name, rect, id] = JSON.parse(fromBase64(entry.name));
  return { albumKey, name, rect, id };
}

export async function albumInFilter(
  album: Album,
  normalizedFilter: string
): Promise<AlbumEntry[]> {
  if (removeDiacritics(album.name).toLowerCase().includes(normalizedFilter)) {
    return (await media(album)).entries;
  }
  return [];

  let data = { ...(await readAlbumIni(album)) };

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
  const picasa = await readAlbumIni(entry.album);
  if (picasa[entry.name] === undefined) {
    picasa[entry.name] = {} as AlbumEntryMetaData;
    writePicasaIni(entry.album, picasa);
  }
}

export function getFaces() {
  return faces;
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
  field: string,
  value: string | null,
  group: string = "Picasa"
) {
  const picasa = await readAlbumIni(album);
  const section = (picasa[group] = (picasa[group] || {}) as PicasaSection);
  if (value !== null) {
    if (section[field] === value) {
      // no change
      return;
    }
    section[field] = value;
  } else {
    delete section[field];
  }
  await writePicasaIni(album, picasa);
}

export async function updatePicasaEntry(
  entry: AlbumEntry,
  field: keyof AlbumEntryMetaData | "*",
  value: any
) {
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
    broadcast("picasaFileMetaChanged", {
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
  let doBroadcast = false;
  picasa[entry.name] = picasa[entry.name] || ({} as AlbumEntryMetaData);
  for (const k of Object.keys(kv) as (keyof AlbumEntryMetaData)[]) {
    if (kv[k] !== undefined && kv[k] !== null) {
      picasa[entry.name][k] = kv[k]!.toString();
    } else {
      delete picasa[entry.name][k];
    }
    if (["filters", "caption", "rotate", "star", "starCount"].includes(k)) {
      doBroadcast = true;
    }
  }

  if (doBroadcast) {
    broadcast("picasaFileMetaChanged", {
      ...entry,
      metadata: picasa[entry.name],
    });
  }
  writePicasaIni(entry.album, picasa);
}
