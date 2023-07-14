import { Stats } from "fs";
import { readdir, stat } from "fs/promises";
import { join, relative } from "path";
import { Queue } from "../../../shared/lib/queue";
import {
  alphaSorter,
  differs,
  isPicture,
  isVideo,
  sleep,
} from "../../../shared/lib/utils";
import {
  Album,
  AlbumChangeEvent,
  AlbumEntry,
  AlbumKind,
  AlbumWithData,
  idFromKey,
  keyFromID,
} from "../../../shared/types/types";
import { imagesRoot } from "../../utils/constants";
import { broadcast } from "../../utils/socketList";
import { albumWithData, mediaCount } from "../rpcFunctions/albumUtils";
import {
  albumInFilter,
  getShortcuts,
  readShortcut,
  setPicasaAlbumShortcut,
} from "../rpcFunctions/picasaIni";
import { getFaceData } from "./faces";

let lastWalk: AlbumWithData[] = [];
const walkQueue = new Queue(10);

const notificationQueue: AlbumChangeEvent[] = [];

export function queueNotification(event: AlbumChangeEvent) {
  notificationQueue.push(event);
}

export async function startAlbumUpdateNotification() {
  while (true) {
    await sleep(1);
    if (notificationQueue.length > 0) {
      broadcast("albumEvent", notificationQueue);
      notificationQueue.splice(0, notificationQueue.length);
    }
  }
}
let resolveInitialScan: Function;
const initialScan = new Promise((resolve) => {
  resolveInitialScan = resolve;
});
export async function updateLastWalkLoop() {
  let iteration = 0;
  while (true) {
    console.info(`Starting scan iteration ${iteration}`);
    const old = [...lastWalk];
    walk("", imagesRoot, async (a: Album) => {
      addOrRefreshOrDeleteAlbum(a, "SkipCheckInfo");
    });
    await walkQueue.drain();
    const deletedAlbums: AlbumWithData[] = [];
    let startIndex = 0;
    for (const oldAlbum of old) {
      if (
        lastWalk.length < startIndex ||
        lastWalk[startIndex].key > oldAlbum.key
      ) {
        // could not be found, it has been removed
        deletedAlbums.push(oldAlbum);
        continue;
      }
      if (lastWalk[startIndex].key === oldAlbum.key) {
        // found it, do nothing
        startIndex++;
        continue;
      }
      startIndex++;
    }
    for (const oldAlbum of deletedAlbums) {
      addOrRefreshOrDeleteAlbum(oldAlbum);
    }

    if (iteration === 0) {
      resolveInitialScan();
    }
    iteration++;
    await sleep(60 * 3); // Wait 3 minutes
  }
}
export async function waitUntilWalk() {
  return initialScan;
}

export async function refreshAlbumKeys(albums: string[]) {
  if (!lastWalk) {
    return;
  }
  await Promise.all(
    albums
      .map((key) => {
        return lastWalk.find((album) => album.key === key);
      })
      .map((album) => addOrRefreshOrDeleteAlbum(album))
  );
}

export async function refreshAlbums(albums: AlbumWithData[]) {
  await Promise.all(albums.map((album) => addOrRefreshOrDeleteAlbum(album)));
}

export async function onRenamedAlbums(from: Album, to: Album) {
  const idx = lastWalk.findIndex((f) => f.key == from.key);
  if (idx === -1) {
    const old = { ...lastWalk[idx] };
    lastWalk[idx] = { ...lastWalk[idx], ...to };
    queueNotification({
      type: "albumRenamed",
      album: old,
      altAlbum: lastWalk[idx],
    });
  }
}

const ALLOW_EMPTY_ALBUM_CREATED_SINCE = 1000 * 60 * 60; // one hour
async function folderAlbumExists(album: Album): Promise<boolean> {
  if (album.kind !== AlbumKind.FOLDER) {
    throw new Error("Not a folder album");
  }
  const p = join(imagesRoot, idFromKey(album.key).id);
  const s = await stat(p).catch(() => false);
  if (s === false) {
    return false;
  }
  if (
    Date.now() - (s as Stats).ctime.getTime() <
    ALLOW_EMPTY_ALBUM_CREATED_SINCE
  ) {
    return true;
  }

  const count = (await mediaCount(album)).count;
  if (count !== 0) {
    return true;
  }
  return false;
}

export async function addOrRefreshOrDeleteAlbum(
  album: Album | undefined,
  options?: "SkipCheckInfo"
) {
  if (!album) {
    return;
  }
  if (lastWalk) {
    const idx = lastWalk.findIndex((f) => f.key == album.key);
    if (!(await folderAlbumExists(album))) {
      if (idx >= 0) {
        const data = lastWalk.splice(idx, 1)[0];
        queueNotification({ type: "albumDeleted", album: data });
      }
    } else {
      if (idx === -1) {
        const [count, shortcut] = await Promise.all([
          mediaCount(album),
          readShortcut(album),
        ]);
        const updated: AlbumWithData = {
          ...album,
          ...count,
          shortcut,
        };
        queueNotification({
          type: "albumAdded",
          album: updated,
        });
        lastWalk.push(updated);
      } else {
        if (options !== "SkipCheckInfo") {
          const [count, shortcut] = await Promise.all([
            mediaCount(album),
            readShortcut(album),
          ]);
          const updated: AlbumWithData = {
            ...album,
            ...count,
            shortcut,
          };

          if (differs(updated, lastWalk[idx])) {
            queueNotification({
              type: "albumInfoUpdated",
              album: updated,
            });
            lastWalk[idx] = updated;
          }
        }
      }
    }
  }
}

export function getFolderAlbumData(key: string) {
  const f = lastWalk.find((f) => f.key == key);
  if (f === undefined) {
    throw new Error(`Album ${key} not found`);
  }
  return f;
}

export async function folders(filter: string): Promise<AlbumWithData[]> {
  let w = [...(lastWalk as AlbumWithData[])];
  if (filter) {
    const filtered: AlbumWithData[] = [];
    for (const album of lastWalk) {
      if ((await albumInFilter(album, filter)).length > 0) filtered.push(album);
    }
    w = filtered;
  }
  return w;
}

async function walk(
  name: string,
  path: string,
  cb: (a: Album) => Promise<void>
): Promise<void> {
  const album: Album = {
    name,
    key: keyFromID(relative(imagesRoot, path), AlbumKind.FOLDER),
    kind: AlbumKind.FOLDER,
  };
  const m = await assetsInFolderAlbum(album);

  // depth down first
  for (const child of m.folders.sort(alphaSorter()).reverse()) {
    walkQueue.add<Album[]>(() =>
      walk(child.normalize(), join(path, child), cb)
    );
  }

  if (m.entries.length > 0) {
    // Complete with count and 'global' picasa data
    cb(album);
  }
}

export async function getFolderAlbums(): Promise<AlbumWithData[]> {
  await waitUntilWalk();
  return lastWalk;
}

export async function setAlbumShortcut(album: Album, shortcut: string) {
  const a = albumWithData(album);
  if (!a) {
    throw new Error("Unknown album");
  }
  const previous = getShortcuts()[shortcut];
  await setPicasaAlbumShortcut(album, shortcut);

  if (previous) {
    addOrRefreshOrDeleteAlbum(previous);
  }
  if (shortcut) {
    addOrRefreshOrDeleteAlbum(album);
  }

  broadcast("shortcutsUpdated", {});
  return;
}

export async function assetsInFolderAlbum(
  album: Album
): Promise<{ entries: AlbumEntry[]; folders: string[] }> {
  if (album.kind !== AlbumKind.FOLDER) {
    throw new Error("Can only scan folders");
  }
  const items = await readdir(join(imagesRoot, idFromKey(album.key).id));
  const entries: AlbumEntry[] = [];
  const folders: string[] = [];

  await Promise.all(
    items
      .filter((i) => !i.startsWith("."))
      .map(async (i) => {
        const entry = { album, name: i.normalize() };
        if (isPicture(entry) || isVideo(entry)) {
          entries.push(entry);
        } else {
          const s = await stat(join(imagesRoot, idFromKey(album.key).id, i));
          if (s.isDirectory()) {
            folders.push(i);
          }
        }
      })
  );

  return { entries, folders };
}
