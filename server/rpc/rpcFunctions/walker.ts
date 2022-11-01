import { Stats } from "fs";
import { stat } from "fs/promises";
import { join, relative } from "path";
import { Queue } from "../../../shared/lib/queue";
import { alphaSorter, differs, sleep } from "../../../shared/lib/utils";
import {
  Album,
  AlbumChangeEvent,
  AlbumWithData,
  FaceAlbum
} from "../../../shared/types/types";
import { imagesRoot } from "../../utils/constants";
import { broadcast } from "../../utils/socketList";
import { assetsInAlbum, mediaCount } from "./media";
import { albumInFilter, getFaces, readPicasaSection } from "./picasaIni";

let lastWalk: AlbumWithData[] = [];
const walkQueue = new Queue(3);

const notificationQueue: AlbumChangeEvent[] = [];

export async function monitorAlbums(): Promise<{}> {
  notificationQueue.push({ type: "albums", albums: lastWalk });
  return {};
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
      addOrRefreshOrDeleteAlbum(a);
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
      .map(addOrRefreshOrDeleteAlbum)
  );
}

export async function refreshAlbums(albums: AlbumWithData[]) {
  await Promise.all(albums.map(addOrRefreshOrDeleteAlbum));
}

export async function onRenamedAlbums(from: Album, to: Album) {
  const idx = lastWalk.findIndex((f) => f.key == from.key);
  const old = { ...lastWalk[idx] };
  lastWalk[idx] = { ...lastWalk[idx], ...to };
  notificationQueue.push({
    type: "albumMoved",
    album: old,
    altAlbum: lastWalk[idx],
  });
}

const ALLOW_EMPTY_ALBUM_CREATED_SINCE = 1000 * 60 * 60; // one hour
async function albumExists(album: Album): Promise<boolean> {
  const p = join(imagesRoot, album.key);
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

export async function addOrRefreshOrDeleteAlbum(album: Album | undefined) {
  if (!album) {
    return;
  }
  if (lastWalk) {
    const idx = lastWalk.findIndex((f) => f.key == album.key);
    if (!(await albumExists(album))) {
      if (idx >= 0) {
        const data = lastWalk.splice(idx, 1)[0];
        notificationQueue.push({ type: "albumDeleted", album: data });
      }
    } else {
      const [media, meta] = await Promise.all([
        mediaCount(album),
        readPicasaSection(album),
      ]);
      const updated =  {...album,  ...media, ...meta };
      if (idx === -1) {
        notificationQueue.push({
          type: "albumAdded",
          album: updated,
        });
        lastWalk.push(updated);
      } else {
        if (differs(updated,lastWalk[idx])) {
          notificationQueue.push({
            type: "albumInfoUpdated",
            album: updated,
          });
          Object.assign(lastWalk[idx], updated);
        }
      }
    }
  }
}

export async function folders(filter: string): Promise<Album[]> {
  let w = [...(lastWalk as Album[])];
  if (filter) {
    const filtered: Album[] = [];
    for (const album of lastWalk) {
      if ((await albumInFilter(album, filter)).length > 0) filtered.push(album);
    }
    w = filtered;
  }

  return w;
}

export async function faceAlbums(): Promise<FaceAlbum[]> {
  // Create 'fake' albums with the faces
  const faces = Array.from(getFaces());
  const names = faces.reduce(
    (prev, face) => prev.add(face[1].name),
    new Set<string>()
  );

  return Array.from(names).map((name) => ({
    name,
    key: `face:${name}`,
  }));
}

async function walk(
  name: string,
  path: string,
  cb: (a: Album) => Promise<void>
): Promise<void> {
  const album = { name, key: relative(imagesRoot, path) };
  const m = await assetsInAlbum(album);

  // depth down first
  for (const child of m.folders.sort(alphaSorter(false)).reverse()) {
    walkQueue.add<Album[]>(() => walk(child, join(path, child), cb));
  }

  if (m.entries.length > 0) {
    // Complete with count and 'global' picasa data
    cb(album);
  }
}
