import debug from "debug";
import { Stats } from "fs";
import { stat } from "fs/promises";
import { join, relative } from "path";
import { addJob, drainGlobalQueue } from "../../../utils/global-job-queue";
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
  initializePicasaIniCache,
  readShortcut,
} from "./picasa-ini";
import { imagesRoot, specialFolders } from "../../../utils/constants";
import { pathForAlbum } from "../../../utils/serverUtils";
import { events } from "../../../../shared/server-events";
import { getAllAlbums, getAlbum, getAlbumEntries as getWalkerAlbumEntries } from "../queries";
import { getWalkerDatabase } from "./database";

const debugLogger = debug("app:walker-db");

const ALLOW_EMPTY_ALBUM_CREATED_SINCE = 1000 * 60 * 60; // one hour

/**
 * Check if an album in the database is stale (folder has been modified since last check)
 * Returns true if the album should be re-processed, false if it's up to date
 */
async function isDBAlbumStale(album: Album): Promise<boolean> {
  const existing = getAlbum(album.key);
  if (!existing || !existing.lastModified) {
    // Album doesn't exist in DB or has no lastModified, consider it stale
    return true;
  }

  try {
    const folderPath = join(imagesRoot, pathForAlbum(album));
    const stats = await stat(folderPath);
    const folderMtime = stats.mtime.getTime().toString();

    // Compare database lastModified with folder mtime
    // If they match, album is not stale
    return existing.lastModified !== folderMtime;
  } catch (error) {
    // If we can't stat the folder, consider it stale so we can detect if it's deleted
    debugLogger(`Error checking folder mtime for album ${album.key}:`, error);
    return true;
  }
}

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
      // Get folder mtime for lastModified
      let folderMtime: string | undefined;
      try {
        const folderPath = join(imagesRoot, pathForAlbum(album));
        const stats = await stat(folderPath);
        folderMtime = stats.mtime.getTime().toString();
      } catch (error) {
        debugLogger(`Error getting folder mtime for album ${album.key}:`, error);
      }

      if (!existing) {
        const [count, shortcut] = await Promise.all([
          mediaCount(album),
          readShortcut(album),
        ]);
        const updated: AlbumWithData = {
          ...album,
          ...count,
          shortcut,
          lastModified: folderMtime,
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
            lastModified: folderMtime,
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

  // Check if album is stale before processing
  const isStale = await isDBAlbumStale(album);
  if (!isStale) {
    // Album is up to date, skip processing
    debugLogger(`Skipping album ${album.key} - not stale (lastModified matches folder mtime)`);
    return;
  }

  const m = await assetsInFolderAlbum(album);
  await reindexAlbumsFromList([album]);


  // depth down first
  for (const child of m.folders.sort(alphaSorter()).reverse()) {
    addJob(
      () => walk(child.normalize(), join(path, child), cb),
      "WALK"
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
  try {
    for (const album of albums) {
      try {
        // Get existing entries
        const existingEntries = getWalkerAlbumEntries(album);
        const existingEntryNames = new Set(existingEntries.map(e => e.name));

        const { entries } = await assetsInFolderAlbum(album);
        const newEntryNames = new Set(entries.map(e => e.name));


        // Get folder mtime for lastModified
        let folderMtime: string | undefined;
        try {
          const folderPath = join(imagesRoot, pathForAlbum(album));
          const stats = await stat(folderPath);
          folderMtime = stats.mtime.getTime().toString();
        } catch (error) {
          debugLogger(`Error getting folder mtime for album ${album.key} in reindexAlbumsFromList:`, error);
        }

        // Update album count
        const existing = getAlbum(album.key);
        if (existing) {
          const updatedAlbum: AlbumWithData = {
            ...existing,
            count: entries.length,
            lastModified: folderMtime,
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
            lastModified: folderMtime,
          };
          const db = getWalkerDatabase();
          db.upsertAlbum(newAlbum);
          events.emit("albumAdded", newAlbum);
        }

        // Emit events for added entries
        for (const entry of entries) {
          if (!existingEntryNames.has(entry.name)) {
            events.emit("albumEntryAdded", entry);
            const db = getWalkerDatabase();
            db.upsertEntry(entry);
          }
        }

        // Emit events for removed entries
        for (const entry of existingEntries) {
          if (!newEntryNames.has(entry.name)) {
            events.emit("albumEntryRemoved", entry);
            const db = getWalkerDatabase();
            db.deleteEntry(entry);
          }
        }



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

/** Resolved when first walk completes. Set by startWalkerInMain. */
let walkerReadyResolve: (() => void) | null = null;
export function setWalkerReadyResolver(resolve: () => void): void {
  walkerReadyResolve = resolve;
}

/**
 * Main entry point for walker - runs in main thread
 */
export async function walkFilesystem(): Promise<void> {
  // Initialize database (read-write in main thread)
  getWalkerDatabase();

  // Initialize picasa-ini cache writer
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

    addJob(
      () =>
        walk("", imagesRoot, async (a: Album) => {
          addOrRefreshOrDeleteAlbum(
            a,
            "SkipCheckInfo",
            true /* we know it's added */
          );
          foundKeys.add(a.key);
        }),
      "WALK"
    );
    await drainGlobalQueue();

    // Find deleted albums
    for (const oldAlbum of oldAlbums) {
      if (!foundKeys.has(oldAlbum.key)) {
        addOrRefreshOrDeleteAlbum(oldAlbum);
      }
    }

    if (iteration === 0) {
      console.info(`Album list retrieved`);
      walkerReadyResolve?.();
      walkerReadyResolve = null;
    }
    iteration++;
    await sleep(60 * 60); // Wait 60 minutes
  }
}

export async function refreshAlbumKeys(albums: string[]) {
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

