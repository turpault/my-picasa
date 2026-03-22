import debug from "debug";
import { Stats } from "fs";
import { stat } from "fs/promises";
import { join, relative } from "path";
import { addJob, drainGlobalQueue } from "../../../utils/main-process-job-queue";
import {
  alphaSorter,
  differs,
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
import { memoStat, pathForAlbumEntry } from "../../../utils/serverUtils";
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
import { startFileWatcher } from "./file-watcher";
import {
  scheduleJobsForEntries,
  schedulePostWalkThumbnailJobsFromDb,
  scheduleRemoveJob,
} from "./post-walk-jobs";

const debugLogger = debug("app:walker-db");

const ALLOW_EMPTY_ALBUM_CREATED_SINCE = 1000 * 60 * 60; // one hour

/**
 * Check if an album in the database is stale (folder has been modified since last check)
 * Returns true if the album should be re-processed, false if it's up to date
 */
async function isDBAlbumStale(album: Album): Promise<boolean> {
  const existing = await getAlbum(album.key);
  if (!existing || !existing.lastModified) {
    // Album doesn't exist in DB or has no lastModified, consider it stale
    return true;
  }

  try {
    const folderPath = join(imagesRoot, pathForAlbum(album));
    const stats = await memoStat(folderPath);
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
  const s = await memoStat(p).catch(() => false);
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
    const existing = await getAlbum(album.key);

    if (!added && !(await folderAlbumExists(album))) {
      if (existing) {
        queueNotification({ type: "albumDeleted", album: existing });
        // Emit server event
        events.emit("albumRemoved", album);
        const db = getWalkerDatabase();
        await db.deleteAlbum(album.key);
      }
    } else {
      // Get folder mtime for lastModified
      let folderMtime: string | undefined;
      try {
        const folderPath = join(imagesRoot, pathForAlbum(album));
        const stats = await memoStat(folderPath);
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
        await db.upsertAlbum(updated);
      } else {
        if (options !== "SkipCheckInfo") {
          // Use existing DB data when available - don't read picasa-ini
          const updated: AlbumWithData = {
            ...album,
            count: existing.count,
            shortcut: existing.shortcut,
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
            await db.upsertAlbum(updated);
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
    // Album is up to date, skip processing (DB is source of truth)
    debugLogger(`Skipping album ${album.key} - not stale (lastModified matches folder mtime)`);
    return;
  }

  let m: { entries: AlbumEntry[]; folders: string[] };
  try {
    m = await assetsInFolderAlbum(album);
  } catch (error) {
    // Folder may have been deleted - skip; "Find deleted albums" loop will remove it
    debugLogger(`Folder gone for album ${album.key}:`, error);
    return;
  }
  await reindexAlbumsFromList([album], { skipEntryEvents: true });


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

/** When true, skip emitting albumEntryAdded/albumEntryFileChanged/albumEntryRemoved to avoid flooding during initial walk. */
type ReindexOptions = { skipEntryEvents?: boolean };

/**
 * Reindex albums from a list of Album objects.
 * Returns added/changed entries (for job scheduling) and removed entries (for removal jobs).
 */
async function reindexAlbumsFromList(
  albums: Album[],
  options?: ReindexOptions
): Promise<{ addedOrChanged: AlbumEntry[]; removed: AlbumEntry[] }> {
  const skipEntryEvents = options?.skipEntryEvents ?? false;
  const addedOrChanged: AlbumEntry[] = [];
  const removed: AlbumEntry[] = [];

  try {
    for (const album of albums) {
      try {
        const existingEntries = await getWalkerAlbumEntries(album);
        const existingEntryNames = new Set(existingEntries.map((e) => e.name));

        let entries: AlbumEntry[];
        try {
          const result = await assetsInFolderAlbum(album);
          entries = result.entries;
        } catch (error) {
          // Folder disappeared from filesystem - delete album and entries from DB
          debugLogger(`Folder gone for album ${album.key}, removing from DB:`, error);
          const existing = await getAlbum(album.key);
          if (existing) {
            queueNotification({ type: "albumDeleted", album: existing });
            events.emit("albumRemoved", album);
            const db = getWalkerDatabase();
            for (const entry of existingEntries) {
              scheduleRemoveJob(entry);
              await db.deleteEntry(entry);
            }
            await db.deleteAlbum(album.key);
          }
          continue;
        }
        const newEntryNames = new Set(entries.map((e) => e.name));

        let folderMtime: string | undefined;
        try {
          const folderPath = join(imagesRoot, pathForAlbum(album));
          const stats = await memoStat(folderPath);
          folderMtime = stats.mtime.getTime().toString();
        } catch (error) {
          debugLogger(`Error getting folder mtime for album ${album.key} in reindexAlbumsFromList:`, error);
        }

        const existing = await getAlbum(album.key);
        if (existing) {
          const updatedAlbum: AlbumWithData = {
            ...existing,
            count: entries.length,
            lastModified: folderMtime,
          };
          const db = getWalkerDatabase();
          await db.upsertAlbum(updatedAlbum);
          events.emit("albumUpdated", updatedAlbum);
        } else {
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
          await db.upsertAlbum(newAlbum);
          events.emit("albumAdded", newAlbum);
        }

        for (const entry of entries) {
          const filePath = pathForAlbumEntry(entry);
          let fileStats: { mtime: string; size: number } | undefined;
          try {
            const s = await memoStat(filePath);
            fileStats = {
              mtime: s.mtime.getTime().toString(),
              size: s.size,
            };
          } catch (e) {
            debugLogger(`Error stating ${entry.name} in ${album.key}:`, e);
          }

          if (!existingEntryNames.has(entry.name)) {
            if (!skipEntryEvents) events.emit("albumEntryAdded", entry);
            const db = getWalkerDatabase();
            await db.upsertEntry(entry, fileStats);
            addedOrChanged.push(entry);
          } else if (fileStats) {
            const db = getWalkerDatabase();
            const cached = await db.getEntryFileStats(entry);
            if (!cached || cached.mtime !== fileStats.mtime || cached.size !== fileStats.size) {
              debugLogger(`File changed: ${entry.name} (mtime/size differ from cache)`);
              if (!skipEntryEvents) events.emit("albumEntryFileChanged", entry);
              await db.updateEntryFileStats(entry, fileStats.mtime, fileStats.size);
              addedOrChanged.push(entry);
            }
          }
        }

        for (const entry of existingEntries) {
          if (!newEntryNames.has(entry.name)) {
            if (!skipEntryEvents) events.emit("albumEntryRemoved", entry);
            scheduleRemoveJob(entry);
            const db = getWalkerDatabase();
            await db.deleteEntry(entry);
            removed.push(entry);
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

  return { addedOrChanged, removed };
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

  // Set up event listener for reindex events (file watcher triggers this)
  events.on("reindex", async (albums: Album[]) => {
    const { addedOrChanged } = await reindexAlbumsFromList(albums);
    await scheduleJobsForEntries(addedOrChanged);
  });

  console.info("Filesystem scan: initial walk");
  const oldAlbums = await getAllAlbums();
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

  console.info("Album list retrieved");

  // Post-walk: thumbnail jobs only where DB versions say cache is stale (not every file stat)
  await schedulePostWalkThumbnailJobsFromDb();
  console.info("Post-walk thumbnail jobs scheduled");

  walkerReadyResolve?.();
  walkerReadyResolve = null;
  startFileWatcher();
}

export async function refreshAlbumKeys(albums: string[]) {
  const albumResults = await Promise.all(albums.map((key) => getAlbum(key)));
  const validAlbums = albumResults.filter((album): album is AlbumWithData => album !== undefined);
  await Promise.all(validAlbums.map((album) => addOrRefreshOrDeleteAlbum(album)));
}

export async function refreshAlbums(albums: AlbumWithData[]) {
  await Promise.all(albums.map((album) => addOrRefreshOrDeleteAlbum(album)));
}

export async function onRenamedAlbums(from: Album, to: Album) {
  try {
    const old = await getAlbum(from.key);
    if (old) {
      const updated: AlbumWithData = { ...old, ...to };
      const db = getWalkerDatabase();
      await db.upsertAlbum(updated);
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
    const albumResults = await Promise.all(albumIds.map((key) => getAlbum(key)));
    const albums = albumResults
      .filter((album): album is AlbumWithData => album !== undefined)
      .map(album => ({ key: album.key, name: album.name }));

    await reindexAlbumsFromList(albums);
  } catch (error) {
    debugLogger("Cannot write to database (not walker worker):", error);
    throw error;
  }
}

