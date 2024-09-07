import { mkdir, readFile, readdir } from "fs/promises";
import { basename, join } from "path";
import ini from "../../../shared/lib/ini";
import { lock } from "../../../shared/lib/mutex";
import { MAX_STAR } from "../../../shared/lib/shared-constants";
import {
  decodeFaces,
  decodeRotate,
  encodeFaces,
  removeDiacritics,
  sleep,
} from "../../../shared/lib/utils";
import {
  FaceList,
  Album,
  AlbumEntry,
  AlbumEntryMetaData,
  AlbumKind,
  AlbumMetaData,
  ContactByHash,
  PicasaSection,
  ThumbnailSize,
  extraFields,
  idFromKey,
  keyFromID,
  Contact,
} from "../../../shared/types/types";
import { events } from "../../events/server-events";
import {
  PICASA,
  facesFolder,
  imagesRoot,
  projectFolder,
} from "../../utils/constants";
import { fileExists, safeWriteFile } from "../../utils/serverUtils";
import { broadcast } from "../../utils/socketList";
import { rate } from "../../utils/stats";
import { media } from "./albumUtils";
import { normalizeName } from "./faces";

export const cachedFilterKey: Record<ThumbnailSize, extraFields> = {
  "th-small": "cached:filters:th-small",
  "th-medium": "cached:filters:th-medium",
  "th-large": "cached:filters:th-large",
};
export const dimensionsFilterKey: Record<ThumbnailSize, extraFields> = {
  "th-small": "cached:dimensions:th-small",
  "th-medium": "cached:dimensions:th-medium",
  "th-large": "cached:dimensions:th-large",
};

export const rotateFilterKey: Record<ThumbnailSize, extraFields> = {
  "th-small": "cached:rotate:th-small",
  "th-medium": "cached:rotate:th-medium",
  "th-large": "cached:rotate:th-large",
};

let picasaMap = new Map<string, AlbumMetaData>();
let lastAccessPicasaMap = new Map<string, number>();
let dirtyPicasaSet = new Map<string, Album>();
let shortcuts: { [shotcut: string]: Album } = {};
const DEFAULT_GRACE_DELAY = "120";

function albumPath(album: Album): string {
  const { id } = idFromKey(album.key);
  switch (album.kind) {
    case AlbumKind.FOLDER:
      return join(imagesRoot, idFromKey(album.key).id, PICASA);
    case AlbumKind.FACE:
      return join(facesFolder, id + ".ini");
    case AlbumKind.PROJECT:
      return join(projectFolder, id + ".ini");
  }
}

export function albumFromNameAndKind(name: string, kind: AlbumKind): Album {
  return {
    kind,
    key: keyFromID(name, kind),
    name,
  };
}

function albumFromPath(path: string): Album {
  let kind: AlbumKind;
  if (path.startsWith(facesFolder)) {
    kind = AlbumKind.FACE;
  } else if (path.startsWith(projectFolder)) {
    kind = AlbumKind.PROJECT;
  } else {
    kind = AlbumKind.FOLDER;
  }
  const fileName = basename(path);
  const name = fileName.split(".ini")[0];
  return albumFromNameAndKind(name, kind);
}

export async function picasaIniCacheWriter() {
  while (true) {
    const grace_delay =
      parseInt(process.env.PICASA_INI_GRACE_DELAY || DEFAULT_GRACE_DELAY) *
      1000;
    const i = dirtyPicasaSet;
    dirtyPicasaSet = new Map<string, Album>();
    i.forEach(async (album) => {
      let target: string = albumPath(album);
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
      if (!lastAccess || Date.now() - lastAccess > grace_delay) {
        picasaMap.delete(key);
        lastAccessPicasaMap.delete(key);
      }
    });
    const picasaIniSleepDelay = parseInt(
      process.env.PICASA_WRITE_SLEEP_DELAY || "10",
    );
    await sleep(picasaIniSleepDelay);
  }
}

export const PicasaBaseKeys = {
  Contacts2: "Contacts2",
  Picasa: "Picasa",
  contact: "contact",
};

export async function readAlbumEntries(album: Album): Promise<AlbumEntry[]> {
  const keys = Object.values(PicasaBaseKeys);
  const data = await readAlbumIni(album);
  return Object.keys(data)
    .filter((k) => !keys.includes(k))
    .map((key) => ({
      album,
      name: key,
    }));
}

export async function listAlbumsOfKind(
  kind: AlbumKind,
  filter?: string,
): Promise<Album[]> {
  const d = {
    [AlbumKind.FACE]: facesFolder,
    [AlbumKind.PROJECT]: projectFolder,
    [AlbumKind.FOLDER]: imagesRoot,
  }[kind];

  if (!(await fileExists(d))) {
    await mkdir(d, { recursive: true });
  }
  const files = await readdir(d);
  const iniFiles = files
    .filter((file) => file.endsWith(".ini") && !file.startsWith("."))
    .filter((file) => {
      if (filter) {
        return file.includes(filter);
      }
      return true;
    });
  return iniFiles.map((ini) => join(d, ini)).map(albumFromPath);
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
    let target: string = albumPath(album);

    // Not in the map, read it
    const iniData = await readFile(target, {
      encoding: "utf8",
    });
    const i = ini.parse(iniData);
    // Read&fix data
    if (album.kind === AlbumKind.FOLDER) {
      if (dataFix(album, i)) {
        writePicasaIni(album, i);
      }
    }
    if (
      i[PicasaBaseKeys.Picasa]?.shortcut !== undefined &&
      !shortcuts[i[PicasaBaseKeys.Picasa].shortcut]
    ) {
      shortcuts[i[PicasaBaseKeys.Picasa].shortcut] = album;
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

export async function albumentriesInFilter(
  album: Album,
  normalizedFilter: string,
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

export function entryWithMeta(entry: AlbumEntry, metadata: AlbumEntryMetaData) {
  return {
    ...entry,
    metadata,
  };
}
export async function getPicasaEntry(
  entry: AlbumEntry,
): Promise<AlbumEntryMetaData> {
  const picasa = await readAlbumIni(entry.album);
  picasa[entry.name] = picasa[entry.name] || ({} as AlbumEntryMetaData);
  return picasa[entry.name];
}

export async function readPicasaSection(
  album: Album,
  section: string = PicasaBaseKeys.Picasa,
): Promise<PicasaSection> {
  const picasa = await readAlbumIni(album);
  picasa[section] = picasa[section] || {};
  return picasa[section] as PicasaSection;
}
export function writePicasaSection(
  album: Album,
  section: string,
  data: PicasaSection,
) {
  for (const key in data) {
    updatePicasa(album, key, data[key], section);
  }
}
export async function deletePicasaSection(album: Album, section: string) {
  const albumData = await readAlbumIni(album);
  delete albumData[section];
  writePicasaIni(album, albumData);
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
    const picasa = await getPicasaEntry(entry);
    const rotateValue = decodeRotate(picasa.rotate);
    const targetValue = (increment + rotateValue) % 4;
    if (targetValue === 0) await setRotate(entry, undefined);
    else await setRotate(entry, `rotate(${targetValue})`);
  }
}

export async function setRotate(entry: AlbumEntry, rotate?: string) {
  if (!rotate) updatePicasaEntry(entry, "rotate", undefined);
  else updatePicasaEntry(entry, "rotate", `rotate(${rotate})`);
  events.emit("rotateChanged", {
    entry: entryWithMeta(entry, await getPicasaEntry(entry)),
  });
}

export async function setFilters(entry: AlbumEntry, filters: string) {
  await updatePicasaEntry(entry, "filters", filters);
  events.emit("filtersChanged", {
    entry: entryWithMeta(entry, await getPicasaEntry(entry)),
  });
}

export async function setCaption(entry: AlbumEntry, caption: string) {
  await updatePicasaEntry(entry, "caption", caption);
  events.emit("captionChanged", {
    entry: entryWithMeta(entry, await getPicasaEntry(entry)),
  });
}

export async function toggleStar(entries: AlbumEntry[]) {
  for (const entry of entries) {
    const picasa = await getPicasaEntry(entry);
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
    events.emit("favoriteChanged", {
      entry: entryWithMeta(entry, await getPicasaEntry(entry)),
    });
  }
}

export async function updatePicasa(
  album: Album,
  field: string | null,
  value: string | null,
  group: string = PicasaBaseKeys.Picasa,
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
    } else {
      // value is null, field is not, but the section wasn't there anyway, nothing to do
      return;
    }
  } else {
    delete picasa[group];
  }
  await writePicasaIni(album, picasa);
}

export async function updatePicasaEntry(
  entry: AlbumEntry,
  field: keyof AlbumEntryMetaData | "*",
  value: any,
) {
  if (entry.name.normalize() !== entry.name) {
    debugger;
  }
  let hasChanged = true;
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
      const valueAsString = `${value}`;
      if (
        picasa[entry.name][field as keyof AlbumEntryMetaData] !== valueAsString
      ) {
        picasa[entry.name][field as keyof AlbumEntryMetaData] = valueAsString;
      } else {
        hasChanged = false;
      }
    } else {
      delete picasa[entry.name][field as keyof AlbumEntryMetaData];
    }
  }

  if (hasChanged) {
    if (["filters", "caption", "rotate", "star", "starCount"].includes(field)) {
      broadcast("albumEntryAspectChanged", {
        ...entry,
        metadata: picasa[entry.name],
      });
    }
    writePicasaIni(entry.album, picasa);
  }
}

export async function updatePicasaEntries(
  entry: AlbumEntry,
  kv: AlbumEntryMetaData,
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
      dirty = true;
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

export function readContacts(picasaIni: AlbumMetaData): ContactByHash {
  if (picasaIni[PicasaBaseKeys.Contacts2]) {
    // includes a map of faces/ids
    return Object.fromEntries(
      Object.entries(
        picasaIni[PicasaBaseKeys.Contacts2] as { [key: string]: string },
      )
        .map(([hash, value]) => {
          if (typeof value === "string" && value.includes(";")) {
            const [originalName, email, something] = value.split(";");
            const name = normalizeName(originalName);
            const key = keyFromID(name, AlbumKind.FACE);
            return [hash, { originalName, email, something, name, key }];
          } else {
            return [hash, null];
          }
        })
        .filter((v) => v[1] !== null),
    );
  }
  return {};
}

export async function updateContactInAlbum(
  album: Album,
  hash: string,
  contact: Contact,
) {
  const picasa = await readAlbumIni(album);
  const contacts2 = (picasa[PicasaBaseKeys.Contacts2] =
    picasa[PicasaBaseKeys.Contacts2] || {});
  const value = `${contact.originalName};${contact.email};${contact.something}`;
  if ((contacts2 as any)[hash] !== value) {
    (contacts2 as any)[hash] =
      `${contact.originalName};${contact.email};${contact.something}`;
    writePicasaIni(album, picasa);
  }
}

function dataFix(album: Album, i: AlbumMetaData): boolean {
  let changed = false;
  const picasa = i[PicasaBaseKeys.Picasa] as PicasaSection;

  if (picasa && picasa.name && picasa.name !== album.name) {
    picasa.name = album.name;
    changed = true;
  }

  for (const key in i) {
    if (i[key]["star"] && i[key]["starCount"] === undefined) {
      i[key]["starCount"] = "1";
      changed = true;
    }
  }

  if (picasa) {
    if (picasa.shortcut && picasa.shortcut != picasa.shortcut.toLowerCase()) {
      picasa.shortcut = picasa.shortcut.toLowerCase();
      changed = true;
    }
  }

  // remove legacy faceHashes
  const contacts = (i[PicasaBaseKeys.Contacts2] || {}) as {
    [key: string]: string;
  };
  for (const key in i) {
    if ((i[key] as any).candidateFaces !== undefined) {
      delete (i[key] as any).candidateFaces;
      changed = true;
    }
    if (i[key].faces !== undefined) {
      const faces: FaceList = [];
      const face = decodeFaces(i[key].faces!);
      for (const f of [...face]) {
        if (f.hash.startsWith("facehash:")) {
          i[key].faces = encodeFaces(faces);
          changed = true;
        } else {
          faces.push(f);
        }
      }
    }
  }
  for (const key in contacts) {
    if (key.includes("facehash:")) {
      delete contacts[key];
      changed = true;
    }
  }

  return changed;
}
