import { Stats } from "fs";
import { stat } from "fs/promises";
import { join, relative } from "path";
import { Queue } from "../../../shared/lib/queue";
import { alphaSorter, differs, sleep } from "../../../shared/lib/utils";
import {
  Album,
  AlbumChangeEvent,
  AlbumEntry,
  AlbumKinds,
  AlbumWithData,
  idFromKey,
  keyFromID,
} from "../../../shared/types/types";
import { imagesRoot } from "../../utils/constants";
import { broadcast } from "../../utils/socketList";
import { assetsInFolderAlbum, media, mediaCount } from "./media";
import {
  albumInFilter,
  getFaceAlbums,
  getFaceData,
  getFaces,
  getShortcuts,
  readAlbumIni,
  readShortcut,
  setPicasaAlbumShortcut,
} from "./picasaIni";

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
      .map((album)=>addOrRefreshOrDeleteAlbum(album))
  );
}

export async function refreshAlbums(albums: AlbumWithData[]) {
  await Promise.all(albums.map((album)=>addOrRefreshOrDeleteAlbum(album)));
}

export async function onRenamedAlbums(from: Album, to: Album) {
  const idx = lastWalk.findIndex((f) => f.key == from.key);
  const old = { ...lastWalk[idx] };
  lastWalk[idx] = { ...lastWalk[idx], ...to };
  queueNotification({
    type: "albumMoved",
    album: old,
    altAlbum: lastWalk[idx],
  });
}

const ALLOW_EMPTY_ALBUM_CREATED_SINCE = 1000 * 60 * 60; // one hour
async function albumExists(album: Album): Promise<boolean> {
  if (album.kind === AlbumKinds.folder) {
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
  } else if (album.kind === AlbumKinds.face) {
    return true;
  }
  throw new Error("Unkown album kind");
}

export function albumWithData(
  album: Album | string
): AlbumWithData | undefined {
  const kind = typeof album === "string" ? idFromKey(album).kind : album.kind;
  const key = typeof album === "string" ? album : album.key;
  if (kind === AlbumKinds.folder) {
    return lastWalk.find((f) => f.key == key);
  } else if (kind === AlbumKinds.face) {
    return getFaceAlbums().find((f) => f.key == key);
  } else throw new Error(`Unknown kind ${kind}`);
}

export async function readAlbumMetadata(album: Album) {
  const ini = await readAlbumIni(album);
  switch (album.kind) {
    case AlbumKinds.folder:
      return ini;
    case AlbumKinds.face:
      await Promise.all(
        Object.keys(ini).map(async (name) => {
          const faceData = await getFaceData({ album, name });
          const originalAlbum = albumWithData(faceData.albumKey);
          if (!originalAlbum) {
            throw new Error(`Unknown album ${faceData.albumKey}`);
          }
          const originalAlbumData = await readAlbumIni(originalAlbum);
          const originalEntry = originalAlbumData[faceData.name];
          if (originalEntry) {
            if (originalEntry.dateTaken)
              ini[name].dateTaken = originalEntry.dateTaken;
            if (originalEntry.star) ini[name].star = originalEntry.star;
          }
        })
      );
      return ini;
    default:
      throw new Error(`Unkown kind ${album.kind}`);
  }
}

export async function getSourceEntry(entry: AlbumEntry) {
  switch (entry.album.kind) {
    case AlbumKinds.folder:
      return entry;
    case AlbumKinds.face:
      const faceData = await getFaceData(entry);
      return { album: albumWithData(faceData.albumKey), name: faceData.name };
    default:
      throw new Error(`Unkown kind ${entry.album.kind}`);
  }
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
    if (!(await albumExists(album))) {
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

export async function getFaceAlbumsWithData(
  _filter: string
): Promise<AlbumWithData[]> {
  // Create 'fake' albums with the faces
  const albums = getFaceAlbums();
  return Array.from(albums)
    .map(albumWithData)
    .filter((v) => !!v) as AlbumWithData[];
}

async function walk(
  name: string,
  path: string,
  cb: (a: Album) => Promise<void>
): Promise<void> {
  const album: Album = {
    name,
    key: keyFromID(relative(imagesRoot, path), AlbumKinds.folder),
    kind: AlbumKinds.folder,
  };
  const m = await assetsInFolderAlbum(album);

  // depth down first
  for (const child of m.folders.sort(alphaSorter()).reverse()) {
    walkQueue.add<Album[]>(() => walk(child, join(path, child), cb));
  }

  if (m.entries.length > 0) {
    // Complete with count and 'global' picasa data
    cb(album);
  }
}

export async function monitorAlbums(): Promise<{}> {
  await waitUntilWalk();
  const f = await getFaceAlbumsWithData("");
  queueNotification({ type: "albums", albums: [...lastWalk, ...f] });
  return {};
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
