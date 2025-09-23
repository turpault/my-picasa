import { Stats } from "fs";
import { stat } from "fs/promises";
import { join, relative } from "path";
import { buildEmitter } from "../shared/lib/event";
import { Queue } from "../shared/lib/queue";
import {
  alphaSorter,
  buildReadySemaphore,
  differs,
  setReady,
  sleep,
} from "../shared/lib/utils";
import {
  Album,
  AlbumKind,
  AlbumWithData,
  keyFromID,
} from "../shared/types/types";
import {
  assetsInFolderAlbum,
  queueNotification,
} from "./rpc/albumTypes/fileAndFolders";
import { mediaCount } from "./rpc/rpcFunctions/albumUtils";
import {
  albumentriesInFilter,
  readShortcut,
} from "./rpc/rpcFunctions/picasa-ini";
import { imagesRoot, specialFolders } from "./utils/constants";
import { pathForAlbum } from "./utils/serverUtils";
import { getIndexingService } from "../worker/background/bg-indexing";

const readyLabelKey = "fileWalker";
const ready = buildReadySemaphore(readyLabelKey);
let lastWalk: AlbumWithData[] = [];
const walkQueue = new Queue(10);
export type AlbumChangeEvent = {
  added: AlbumWithData;
  deleted: AlbumWithData;
  updated: AlbumWithData;
};

export const albumEventEmitter = buildEmitter<AlbumChangeEvent>();

export async function updateLastWalkLoop() {
  let iteration = 0;
  while (true) {
    console.info(`Filesystem scan: iteration ${iteration}`);
    const old = [...lastWalk];
    walkQueue.add(() =>
      walk("", imagesRoot, async (a: Album) => {
        addOrRefreshOrDeleteAlbum(
          a,
          "SkipCheckInfo",
          true /* we know it's added */,
        );
      }),
    );
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
      console.info(`Album list retrieved`);
      setReady(readyLabelKey);
    }
    iteration++;
    await sleep(60 * 60); // Wait 60 minutes
  }
}
export async function waitUntilWalk() {
  return ready;
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
      .map((album) => addOrRefreshOrDeleteAlbum(album)),
  );
}

export async function refreshAlbums(albums: AlbumWithData[]) {
  await Promise.all(albums.map((album) => addOrRefreshOrDeleteAlbum(album)));
}

export async function onRenamedAlbums(from: Album, to: Album) {
  const idx = lastWalk.findIndex((f) => f.key == from.key);
  if (idx !== -1) {
    const old = { ...lastWalk[idx] };
    lastWalk[idx] = { ...lastWalk[idx], ...to };
    queueNotification({
      type: "albumRenamed",
      altAlbum: old,
      album: lastWalk[idx],
    });
  }
}

const ALLOW_EMPTY_ALBUM_CREATED_SINCE = 1000 * 60 * 60; // one hour
async function folderAlbumExists(album: Album): Promise<boolean> {
  if (album.kind !== AlbumKind.FOLDER) {
    throw new Error("Not a folder album");
  }
  const p = join(imagesRoot, pathForAlbum(album));
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
  options?: "SkipCheckInfo",
  added?: boolean,
) {
  if (!album) {
    return;
  }
  if (lastWalk) {
    const idx = lastWalk.findIndex((f) => f.key == album.key);
    if (!added && !(await folderAlbumExists(album))) {
      if (idx >= 0) {
        const data = lastWalk.splice(idx, 1)[0];
        queueNotification({ type: "albumDeleted", album: data });
        albumEventEmitter.emit("deleted", data);
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
        albumEventEmitter.emit("added", updated);
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
            albumEventEmitter.emit("updated", updated);
            lastWalk[idx] = updated;
          }
        }
      }
    }
  }
}

async function walk(
  name: string,
  path: string,
  cb: (a: Album) => Promise<void>,
): Promise<void> {
  // Exclude special folders
  if (specialFolders.includes(path)) {
    return;
  }
  const album: Album = {
    name,
    key: keyFromID(relative(imagesRoot, path), AlbumKind.FOLDER),
    kind: AlbumKind.FOLDER,
  };
  const m = await assetsInFolderAlbum(album);

  // depth down first
  for (const child of m.folders.sort(alphaSorter()).reverse()) {
    walkQueue.add<Album[]>(() =>
      walk(child.normalize(), join(path, child), cb),
    );
  }

  if (m.entries.length > 0) {
    cb(album);
  }
}

export async function getFolderAlbums(): Promise<AlbumWithData[]> {
  await waitUntilWalk();
  return lastWalk;
}

export async function folders(filter: string): Promise<AlbumWithData[]> {
  if (filter) {
    const indexingService = getIndexingService();

    // Query folders by matching the filter string
    const matchedAlbums = indexingService.queryFoldersByStrings([filter]);

    // Convert matched albums to AlbumWithData by finding them in lastWalk
    const filtered: AlbumWithData[] = [];
    for (const matchedAlbum of matchedAlbums) {
      const album = lastWalk.find(a => a.key === matchedAlbum.key);
      if (album) {
        filtered.push(album);
      }
    }
    return filtered;
  }
  return [...(lastWalk as AlbumWithData[])];
}

export function getFolderAlbumData(key: string) {
  const f = lastWalk.find((f) => f.key == key);
  if (f === undefined) {
    throw new Error(`Album ${key} not found`);
  }
  return f;
}
