import debug from "debug";
import { parentPort } from "worker_threads";
import { events } from "../../../../shared/server-events";
import { media } from "../../../rpc/rpcFunctions/albumUtils";
import { waitUntilIdle } from "../../../utils/busy";
import { getAllAlbums } from "../../walker/queries";
import { lock } from "../../../../shared/lib/mutex";
import { Queue } from "../../../../shared/lib/queue";
import { sleep } from "../../../../shared/lib/utils";
import { AlbumEntry } from "../../../../shared/types/types";
import { getIndexingDatabaseReadWrite } from "./database";
import type { IndexingDatabaseAccess } from "./database";

const debugLogger = debug("app:bg-indexing");

const MAX_DB_RETRIES = 3;
const DB_RETRY_DELAY_MS = 500;

function isSqliteLockError(e: unknown): boolean {
  const err = e as { code?: string; message?: string };
  return err?.code === "SQLITE_IOERR_LOCK"
    || err?.message?.includes("disk I/O error")
    || err?.message?.includes("database is locked");
}

async function indexPictureWithRetry(db: IndexingDatabaseAccess, entry: AlbumEntry): Promise<void> {
  for (let attempt = 0; attempt < MAX_DB_RETRIES; attempt++) {
    try {
      db.indexPicture(entry);
      return;
    } catch (e) {
      if (attempt < MAX_DB_RETRIES - 1 && isSqliteLockError(e)) {
        await sleep((attempt + 1) * DB_RETRY_DELAY_MS / 1000);
      } else {
        throw e;
      }
    }
  }
}

// Queue for processing indexing operations
const indexingQueue = new Queue(3);

/**
 * Queue indexing for an entry
 */
function queueIndexing(entry: AlbumEntry): void {
  indexingQueue.add(async () => {
    await waitUntilIdle();
    const db = getIndexingDatabaseReadWrite();
    try {
      debugLogger(`Indexing file: ${entry.name}`);
      await indexPictureWithRetry(db, entry);
    } catch (error) {
      debugLogger(`Error indexing ${entry.name}:`, error);
    }
  });
}

/**
 * Set up event listeners for forwarded ServerEvents
 * Updates the search index (including FTS) when files are added, removed, or metadata changes
 */
function setupEventListeners(): void {
  debugLogger("Setting up event listeners for search index updates");

  // Handle albumEntryAdded - index new files
  events.on("albumEntryAdded", async (entry: AlbumEntry) => {
    debugLogger(`Queueing indexing for new file: ${entry.name}`);
    queueIndexing(entry);
  });

  // Handle albumEntryRemoved - remove deleted files
  events.on("albumEntryRemoved", async (entry: AlbumEntry) => {
    debugLogger(`Queueing removal of deleted file from index: ${entry.name}`);
    indexingQueue.add(async () => {
      await waitUntilIdle();
      const db = getIndexingDatabaseReadWrite();
      try {
        await db.removePicture(entry);
      } catch (error) {
        debugLogger(`Error removing ${entry.name} from index:`, error);
      }
    });
  });

  // Handle captionChanged - update entry when caption changes
  events.on("captionChanged", async (event: { entry: any }) => {
    const { entry } = event;
    debugLogger(`Queueing update for entry ${entry.name} (caption changed)`);
    indexingQueue.add(async () => {
      await waitUntilIdle();
      const db = getIndexingDatabaseReadWrite();
      try {
        await db.updateEntry(entry, entry.metadata);
      } catch (error) {
        debugLogger("Error handling captionChanged event:", error);
      }
    });
  });

  // Handle picasaEntryUpdated - update entry when metadata changes
  events.on("picasaEntryUpdated", async (event: { entry: any; field: string; value: any }) => {
    const { entry, field } = event;

    // Only update if the field is one we care about (geoPOI is now handled via geoDataFound event)
    const relevantFields = ['starCount', 'photostar', 'text', 'caption', 'persons'];
    if (relevantFields.includes(field)) {
      debugLogger(`Queueing update for entry ${entry.name}, field: ${field}`);
      indexingQueue.add(async () => {
        await waitUntilIdle();
        const db = getIndexingDatabaseReadWrite();
        try {
          await db.updateEntry(entry, entry.metadata);
        } catch (error) {
          debugLogger("Error handling picasaEntryUpdated event:", error);
        }
      });
    }
  });

  // Handle geoDataFound - update geo POI in search index when geo data becomes available
  events.on("geoDataFound", async (entry: AlbumEntry) => {
    debugLogger(`Queueing geo POI update for entry: ${entry.name}`);
    indexingQueue.add(async () => {
      await waitUntilIdle();
      const db = getIndexingDatabaseReadWrite();
      try {
        await db.updateGeoPOI(entry);
      } catch (error) {
        debugLogger(`Error updating geo POI for ${entry.name} in search index:`, error);
      }
    });
  });

  debugLogger("Event listeners set up successfully");
}

/**
 * Index all pictures in the system with mark-and-sweep cleanup
 */
async function indexAllPictures(): Promise<void> {
  debugLogger("Starting full picture indexing with mark-and-sweep...");
  const l = await lock("indexAllPictures");
  const db = getIndexingDatabaseReadWrite();

  // Phase 1: Clear all marks
  db.clearAllMarks();

  const q = new Queue(3);
  const albums = await getAllAlbums();
  // Sort album by name in reverse (most recent first)
  albums.sort((a, b) => b.name.localeCompare(a.name));

  let processedPictures = 0;
  let processedAlbums = 0;
  debugLogger(`Total albums to index: ${albums.length}`);

  // Progress monitoring
  const progressInterval = setInterval(() => {
    if (q.total() > 0) {
      debugLogger(
        `Indexing progress: ${Math.floor((q.done() * 100) / q.total())}% (${q.done()} done)`
      );
    }
  }, 2000);

  // Phase 2: Mark and index pictures in parallel with queue
  for (const album of albums) {
    let m: { entries: AlbumEntry[] };
    try {
      m = await media(album);
    } catch (e) {
      debugLogger(`Album ${album.name} is gone, skipping...`);
      continue;
    }
    processedAlbums++;

    for (const entry of m.entries) {
      q.add(async () => {
        await waitUntilIdle();
        try {
          await indexPictureWithRetry(db, entry);
          processedPictures++;
          if (processedPictures % 100 === 0) {
            debugLogger(`Indexed ${processedPictures} pictures (${processedAlbums}/${albums.length} albums)`);
          }
        } catch (error) {
          debugLogger(`Error indexing ${entry.name}:`, error);
        }
      });
    }
  }

  await q.drain();
  clearInterval(progressInterval);

  // Phase 3: Sweep unmarked records
  const removedCount = db.sweepUnmarkedRecords();

  // FTS integrity check is done automatically on database initialization
  debugLogger(`Picture indexing completed. Removed ${removedCount} orphaned records.`);
  l();
}

// Main entry point for indexing pictures
export async function indexPictures(): Promise<void> {
  // Initialize database (read-write in indexing worker)
  // This will trigger database creation and migration
  const db = getIndexingDatabaseReadWrite();

  // Send ready message after database initialization
  if (parentPort) {
    parentPort.postMessage({ type: "ready" });
  }

  // Use indexAllPictures which uses a queue for all indexing operations
  await indexAllPictures();

  // Set up event listeners for forwarded ServerEvents
  setupEventListeners();
}

