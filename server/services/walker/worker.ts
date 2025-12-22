import debug from "debug";
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
import { searchFoldersByFilters } from "../search/queries";
import { events } from "../../events/server-events";
import { getAllAlbums, getAlbum, getAlbumEntries as getWalkerAlbumEntries, upsertAlbum, deleteAlbum, replaceAlbumEntries } from "./queries";
import { getWalkerDatabase } from "./database";

const debugLogger = debug("app:walker-db");
const readyLabelKey = "fileWalker";
const ready = buildReadySemaphore(readyLabelKey);
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

// Keep emitters for backward compatibility with existing code
export const albumEventEmitter = buildEmitter<AlbumChangeEvent>();
export const fileFoundEventEmitter = buildEmitter<FileFoundEvent>();
export const albumFoundEventEmitter = buildEmitter<AlbumFoundEvent>();
export const listedMediaEventEmitter = buildEmitter<ListedMediaEvent>();
export const albumEntryEventEmitter = buildEmitter<AlbumEntryChangedEvent>();

export function initializeWorkerListeners() {
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
      } else if (msg.type === "notification") {
        queueNotification(msg.event);
      }
    });
  }
}

/**
 * Main entry point for walker worker
 */
async function walkFilesystem(): Promise<void> {
  // If in main thread OR not the walker service, do nothing
  if (isMainThread || workerData.serviceName !== 'walker') {
    return;
  }

  // Initialize database (will be read-write in walker worker)
  getWalkerDatabase();
  let iteration = 0;
  while (true) {
    console.info(`Filesystem scan: iteration ${iteration}`);
    const oldAlbums = getAllAlbums();
    const oldKeys = new Set(oldAlbums.map(a => a.key));
    const foundKeys = new Set<string>();

    walkQueue.add(() =>
      walk("", imagesRoot, async (a: Album) => {
        addOrRefreshOrDeleteAlbum(
          a,
          "SkipCheckInfo",
          true /* we know it's added */
        );
        foundKeys.add(a.key);
      })
    );
    await walkQueue.drain();

    // Find deleted albums
    for (const oldAlbum of oldAlbums) {
      if (!foundKeys.has(oldAlbum.key)) {
        addOrRefreshOrDeleteAlbum(oldAlbum);
      }
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

/**
 * Start the walker worker
 */
export async function startWorker(): Promise<void> {
  await walkFilesystem();
}

// Initialize worker if running in a worker thread
if (parentPort && workerData?.serviceName === 'walker') {
  const serviceName = workerData.serviceName;
  console.info(`Worker thread started for service: ${serviceName}`);
  startWorker().catch((error) => {
    console.error(`Error starting worker ${serviceName}:`, error);
    process.exit(1);
  });
}

export async function waitUntilWalk() {
  return ready;
}

export async function refreshAlbumKeys(albums: string[]) {
  if (isMainThread) {
    // In main thread, we can't write to the database
    // This should be called via RPC from the walker worker
    return;
  }

  await Promise.all(
    albums
      .map((key) => getAlbum(key))
      .filter((album): album is AlbumWithData => album !== undefined)
      .map((album) => addOrRefreshOrDeleteAlbum(album))
  );
}

export async function refreshAlbums(albums: AlbumWithData[]) {
  await Promise.all(albums.map((album) => addOrRefreshOrDeleteAlbum(album)));
}

export async function onRenamedAlbums(from: Album, to: Album) {
  if (isMainThread) {
    return;
  }

  try {
    const old = getAlbum(from.key);
    if (old) {
      const updated: AlbumWithData = { ...old, ...to };
      upsertAlbum(updated);
      queueNotification({
        type: "albumRenamed",
        altAlbum: old,
        album: updated,
      });
    }
  } catch (error) {
    debugLogger("Cannot write to database (not walker worker):", error);
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

  if (isMainThread) {
    // In main thread, we can't write to the database
    return;
  }

  try {
    const existing = getAlbum(album.key);

    if (!added && !(await folderAlbumExists(album))) {
      if (existing) {
        queueNotification({ type: "albumDeleted", album: existing });
        // Emit through local emitter for backward compatibility
        albumEventEmitter.emit("deleted", existing);
        deleteAlbum(album.key);
      }
    } else {
      if (!existing) {
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
        // Emit through ServerEvents (will be forwarded to all workers)
        events.emit("albumFound", updated);
        upsertAlbum(updated);
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

          if (differs(updated, existing)) {
            queueNotification({
              type: "albumInfoUpdated",
              album: updated,
            });
            // Emit through local emitter for backward compatibility
            albumEventEmitter.emit("updated", updated);
            upsertAlbum(updated);
          }
        }
      }
    }
  } catch (error) {
    debugLogger("Cannot write to database (not walker worker):", error);
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
  return getAllAlbums();
}

export async function folders(filters?: Filters): Promise<AlbumWithData[]> {
  if (filters) {
    // Use database-level filtering for better performance
    const matchedAlbums = await searchFoldersByFilters(filters);

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
  return getAllAlbums();
}

export function getFolderAlbumData(key: string) {
  const album = getAlbum(key);
  if (!album) {
    throw new Error(`Album ${key} not found`);
  }
  return album;
}

/**
 * Reindex albums by updating their entries from folder contents
 * @param albumIds List of album keys to reindex
 */
export async function reindexAlbums(albumIds: string[]): Promise<void> {
  if (isMainThread) {
    throw new Error("reindexAlbums must be called from the walker worker");
  }

  try {
    for (const albumKey of albumIds) {
      const album = getAlbum(albumKey);
      if (!album || album.kind !== AlbumKind.FOLDER) {
        debugLogger(`Skipping reindex for album ${albumKey}: not found or not a folder album`);
        continue;
      }

      try {
        const folderAlbum: Album = {
          key: album.key,
          name: album.name,
          kind: album.kind,
        };

        const { entries } = await assetsInFolderAlbum(folderAlbum);

        // Update album count
        const updatedAlbum: AlbumWithData = {
          ...album,
          count: entries.length,
        };
        upsertAlbum(updatedAlbum);

        // Replace all entries for this album
        replaceAlbumEntries(folderAlbum, entries);

        debugLogger(`Reindexed album ${albumKey}: ${entries.length} entries`);
      } catch (error) {
        debugLogger(`Error reindexing album ${albumKey}:`, error);
      }
    }
  } catch (error) {
    debugLogger("Cannot write to database (not walker worker):", error);
    throw error;
  }
}

/**
 * Get album entries from the database
 */
export function getAlbumEntries(album: Album): AlbumEntry[] {
  return getWalkerAlbumEntries(album);
}

