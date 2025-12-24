import debug from "debug";
import { Stats } from "fs";
import { stat } from "fs/promises";
import { join, relative } from "path";
import { isMainThread, workerData } from "worker_threads";
import { Queue } from "../../../../shared/lib/queue";
import {
  alphaSorter,
  differs,
  sleep,
} from "../../../../shared/lib/utils";
import {
  Album,
  AlbumEntry,
  AlbumWithData,
  keyFromID,
} from "../../../../shared/types/types";
import {
  assetsInFolderAlbum,
  queueNotification,
} from "../../../rpc/fileAndFolders";
import { mediaCount } from "../../../rpc/rpcFunctions/albumUtils";
import {
  readShortcut,
} from "./picasa-ini";
import { imagesRoot, specialFolders } from "../../../utils/constants";
import { pathForAlbum } from "../../../utils/serverUtils";
import { events } from "../../../../shared/server-events";
import { getAllAlbums, getAlbum, getAlbumEntries as getWalkerAlbumEntries } from "../queries";
import { getWalkerDatabase } from "./database";

const debugLogger = debug("app:walker-db");
const walkQueue = new Queue(10);

const ALLOW_EMPTY_ALBUM_CREATED_SINCE = 1000 * 60 * 60; // one hour

async function folderAlbumExists(album: Album): Promise<boolean> {
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

async function addOrRefreshOrDeleteAlbum(
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
        // Emit server event
        events.emit("albumRemoved", album);
        const db = getWalkerDatabase();
        db.deleteAlbum(album.key);
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
        events.emit("albumAdded", updated);
        const db = getWalkerDatabase();
        db.upsertAlbum(updated);
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
            // Emit server event
            events.emit("albumUpdated", updated);
            const db = getWalkerDatabase();
            db.upsertAlbum(updated);
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
    key: keyFromID(relative(imagesRoot, path)),
  };
  const m = await assetsInFolderAlbum(album);

  // Get existing entries from database
  const existingEntries = getWalkerAlbumEntries(album);
  const existingEntryNames = new Set(existingEntries.map(e => e.name));
  const newEntryNames = new Set(m.entries.map(e => e.name));

  // Emit events for added entries
  for (const entry of m.entries) {
    if (!existingEntryNames.has(entry.name)) {
      events.emit("albumEntryAdded", entry);
    }
  }

  // Emit events for removed entries
  for (const entry of existingEntries) {
    if (!newEntryNames.has(entry.name)) {
      events.emit("albumEntryRemoved", entry);
    }
  }

  // Update entries in database
  if (m.entries.length > 0 || existingEntries.length > 0) {
    const db = getWalkerDatabase();
    db.replaceAlbumEntries(album, m.entries);
  }

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

/**
 * Reindex albums from a list of Album objects
 */
async function reindexAlbumsFromList(albums: Album[]): Promise<void> {
  if (isMainThread) {
    throw new Error("reindexAlbumsFromList must be called from the walker worker");
  }

  try {
    for (const album of albums) {
      try {
        // Get existing entries
        const existingEntries = getWalkerAlbumEntries(album);
        const existingEntryNames = new Set(existingEntries.map(e => e.name));

        const { entries } = await assetsInFolderAlbum(album);
        const newEntryNames = new Set(entries.map(e => e.name));

        // Emit events for added entries
        for (const entry of entries) {
          if (!existingEntryNames.has(entry.name)) {
            events.emit("albumEntryAdded", entry);
          }
        }

        // Emit events for removed entries
        for (const entry of existingEntries) {
          if (!newEntryNames.has(entry.name)) {
            events.emit("albumEntryRemoved", entry);
          }
        }

        // Update album count
        const existing = getAlbum(album.key);
        if (existing) {
          const updatedAlbum: AlbumWithData = {
            ...existing,
            count: entries.length,
          };
          const db = getWalkerDatabase();
          db.upsertAlbum(updatedAlbum);
          events.emit("albumUpdated", updatedAlbum);
        } else {
          // Album doesn't exist in DB, add it
          const [count, shortcut] = await Promise.all([
            mediaCount(album),
            readShortcut(album),
          ]);
          const newAlbum: AlbumWithData = {
            ...album,
            ...count,
            shortcut,
          };
          const db = getWalkerDatabase();
          db.upsertAlbum(newAlbum);
          events.emit("albumAdded", newAlbum);
        }

        // Replace all entries for this album
        const db = getWalkerDatabase();
        db.replaceAlbumEntries(album, entries);

        debugLogger(`Reindexed album ${album.key}: ${entries.length} entries`);
      } catch (error) {
        debugLogger(`Error reindexing album ${album.key}:`, error);
      }
    }
  } catch (error) {
    debugLogger("Error in reindexAlbumsFromList:", error);
    throw error;
  }
}

/**
 * Main entry point for walker worker
 */
export async function walkFilesystem(): Promise<void> {
  // If in main thread OR not the walker service, do nothing
  if (isMainThread || workerData.serviceName !== 'walker') {
    return;
  }

  // Initialize database (will be read-write in walker worker)
  getWalkerDatabase();

  // Initialize RPC service for walker worker
  const { WorkerAdaptor } = await import("../../../../shared/rpc-transport/worker-adaptor");
  const { registerServices } = await import("../../../rpc/rpc-handler");
  const { WalkerWorkerClient } = await import("./walker-worker-rpc");

  const workerAdaptor = new WorkerAdaptor(); // No worker parameter = worker thread mode
  registerServices(workerAdaptor, [WalkerWorkerClient], {});

  // Initialize picasa-ini cache writer (only in worker thread)
  const { initializePicasaIniCache } = await import("./picasa-ini");
  // Start the cache writer in background (it runs forever)
  initializePicasaIniCache().catch((error) => {
    debugLogger("Error in picasa-ini cache writer:", error);
  });

  // Set up event listener for reindex events
  events.on("reindex", async (albums: Album[]) => {
    await reindexAlbumsFromList(albums);
  });

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
      const { parentPort } = await import("worker_threads");
      if (parentPort) {
        parentPort.postMessage({ type: "ready" });
      }
    }
    iteration++;
    await sleep(60 * 60); // Wait 60 minutes
  }
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
      const db = getWalkerDatabase();
      db.upsertAlbum(updated);
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

/**
 * Reindex albums by updating their entries from folder contents
 * @param albumIds List of album keys to reindex
 */
export async function reindexAlbums(albumIds: string[]): Promise<void> {
  if (isMainThread) {
    throw new Error("reindexAlbums must be called from the walker worker");
  }

  try {
    const albums = albumIds
      .map((key) => getAlbum(key))
      .filter((album): album is AlbumWithData => album !== undefined)
      .map(album => ({ key: album.key, name: album.name }));

    await reindexAlbumsFromList(albums);
  } catch (error) {
    debugLogger("Cannot write to database (not walker worker):", error);
    throw error;
  }
}

