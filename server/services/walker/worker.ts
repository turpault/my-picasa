import { Stats } from "fs";
import { stat } from "fs/promises";
import { join, relative } from "path";
import { isMainThread, parentPort, workerData } from "worker_threads";
import { startWorkers, broadcast, getAllWorkers } from "../../worker-manager";
import { buildEmitter } from "../../../shared/lib/event";
import { Queue } from "../../../shared/lib/queue";
import {
  alphaSorter,
  buildReadySemaphore,
  differs,
  setReady,
  sleep,
} from "../../../shared/lib/utils";
import {
  Album,
  AlbumChangeEvent,
  AlbumEntry,
  AlbumEntryWithMetadata,
  AlbumKind,
  AlbumWithData,
  Filters,
  keyFromID,
} from "../../../shared/types/types";
import {
  assetsInFolderAlbum,
  queueNotification,
} from "../../rpc/albumTypes/fileAndFolders";
import { mediaCount } from "../../rpc/rpcFunctions/albumUtils";
import {
  getShortcuts,
  readShortcut,
} from "../../rpc/rpcFunctions/picasa-ini";
import { imagesRoot, specialFolders } from "../../utils/constants";
import { pathForAlbum } from "../../utils/serverUtils";
import { queryFoldersByFilters } from "../indexing/worker";
import { events } from "../../events/server-events";

const readyLabelKey = "fileWalker";
const ready = buildReadySemaphore(readyLabelKey);
let lastWalk: AlbumWithData[] = [];
const walkQueue = new Queue(10);

export type FileFoundEvent = {
  fileFound: AlbumEntry;
  fileGone: AlbumEntry;
};

export type AlbumFoundEvent = {
  albumFound: AlbumWithData;
};

export type ListedMediaEvent = {
  assetsInFolderAlbum: { album: Album; entries: AlbumEntry[] };
};
export type AlbumEntryChangedEvent = {
  albumEntryChanged: AlbumEntryWithMetadata;
};

export const albumEventEmitter = buildEmitter<AlbumChangeEvent>();
export const fileFoundEventEmitter = buildEmitter<FileFoundEvent>();
export const albumFoundEventEmitter = buildEmitter<AlbumFoundEvent>();
export const listedMediaEventEmitter = buildEmitter<ListedMediaEvent>();
export const albumEntryEventEmitter = buildEmitter<AlbumEntryChangedEvent>();

export function startWorker() {
  if (!isMainThread) return;

  console.info("Initializing worker listeners...");
  startWorkers(); // Starts all workers

  const workers = getAllWorkers();

  for (const worker of workers) {
    worker.on("message", (msg) => {
      if (msg.type === "ready") {
        setReady(readyLabelKey);
        // Relay ready to other workers
        broadcast(msg, 'walker');
      } else if (msg.type === "event" && msg.emitter === "albumEventEmitter") {
        // Update local cache
        handleAlbumEvent(msg.eventType, msg.data);

        // Re-emit in main thread
        albumEventEmitter.emit(msg.eventType, msg.data);

        // Broadcast to other workers (indexing, thumbs, etc)
        broadcast(msg, 'walker');
      } else if (msg.type === "event" && msg.emitter === "fileFoundEventEmitter") {
        // Re-emit in main thread
        fileFoundEventEmitter.emit(msg.eventType, msg.data);
        // Also emit through ServerEvents
        if (msg.eventType === "fileFound" || msg.eventType === "fileGone") {
          events.emit(msg.eventType, msg.data);
        }

        // Broadcast to other workers
        broadcast(msg, 'walker');
      } else if (msg.type === "notification") {
        queueNotification(msg.event);
      }
    });
  }
}

// Helper to update local cache
function handleAlbumEvent(type: string, event: any) {
  if (type === "added") {
    const idx = lastWalk.findIndex((a) => a.key === event.key);
    if (idx === -1) {
      lastWalk.push(event);
    } else {
      lastWalk[idx] = event;
    }
  } else if (type === "updated") {
    const idx = lastWalk.findIndex((a) => a.key === event.key);
    if (idx !== -1) lastWalk[idx] = event;
  } else if (type === "deleted") {
    const idx = lastWalk.findIndex((a) => a.key === event.key);
    if (idx !== -1) lastWalk.splice(idx, 1);
  }
}

// Support passive mode in workers
if (!isMainThread && parentPort && workerData.serviceName !== 'walker') {
  parentPort.on("message", (msg) => {
    if (msg.type === "ready") {
      setReady(readyLabelKey);
    } else if (msg.type === "event" && msg.emitter === "albumEventEmitter") {
      handleAlbumEvent(msg.eventType, msg.data);
      // Also emit locally for listeners in this worker (e.g. indexer)
      albumEventEmitter.emit(msg.eventType, msg.data);
    } else if (msg.type === "event" && msg.emitter === "fileFoundEventEmitter") {
      fileFoundEventEmitter.emit(msg.eventType, msg.data);
      // Also emit through ServerEvents
      if (msg.eventType === "fileFound" || msg.eventType === "fileGone") {
        events.emit(msg.eventType, msg.data);
      }
    }
  });
}

// Forward events from active walker worker
if (!isMainThread && parentPort && workerData.serviceName === 'walker') {
  albumEventEmitter.on("*", (type, event) => {
    parentPort?.postMessage({
      type: "event",
      emitter: "albumEventEmitter",
      eventType: type,
      data: event,
    });
  });

  fileFoundEventEmitter.on("*", (type, event) => {
    parentPort?.postMessage({
      type: "event",
      emitter: "fileFoundEventEmitter",
      eventType: type,
      data: event,
    });
    // Also emit through ServerEvents
    if (type === "fileFound" || type === "fileGone") {
      events.emit(type, event as AlbumEntry);
    }
  });
}

export async function updateLastWalkLoop() {
  // If in main thread OR not the walker service, do nothing
  if (isMainThread || workerData.serviceName !== 'walker') {
    return;
  }

  let iteration = 0;
  while (true) {
    console.info(`Filesystem scan: iteration ${iteration}`);
    const old = [...lastWalk];
    walkQueue.add(() =>
      walk("", imagesRoot, async (a: Album) => {
        addOrRefreshOrDeleteAlbum(
          a,
          "SkipCheckInfo",
          true /* we know it's added */
        );
      })
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
      if (parentPort) {
        parentPort.postMessage({ type: "ready" });
      }
    }
    iteration++;
    await sleep(60 * 60); // Wait 60 minutes
  }
}

export async function waitUntilWalk() {
  return ready;
}

export async function refreshAlbumKeys(albums: string[]) {
  // if (isMainThread && worker) {
  // TODO: Send message to worker to refresh specific albums?
  // For now, we rely on local refresh which is fine if shared FS
  // But better to delegate to worker if consistent state is needed
  // }

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
  added?: boolean
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
        events.emit("albumFound", updated);
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
  cdEntryCb?: (e: AlbumEntry) => Promise<void>
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
      walk(child.normalize(), join(path, child), cb)
    );
  }

  if (m.entries.length > 0) {
    cb(album);
    for (const entry of m.entries) {
      cdEntryCb?.(entry);
    }
  }
}

export async function getFolderAlbums(): Promise<AlbumWithData[]> {
  await waitUntilWalk();
  return lastWalk;
}

export async function folders(filters?: Filters): Promise<AlbumWithData[]> {
  if (filters) {
    // Use database-level filtering for better performance
    const matchedAlbums = await queryFoldersByFilters(filters);

    // Complete with shortcuts
    const shortcuts = Object.values(getShortcuts());
    for (const album of matchedAlbums) {
      const shortcut = shortcuts.find((s) => s.key === album.key);
      if (shortcut) {
        album.shortcut = shortcut.name;
      }
    }
    return matchedAlbums;
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

