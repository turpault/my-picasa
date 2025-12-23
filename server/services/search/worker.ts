import debug from "debug";
import { parentPort, workerData } from "worker_threads";
import { events } from "../../events/server-events";
import { media } from "../../rpc/rpcFunctions/albumUtils";
import { waitUntilIdle } from "../../utils/busy";
import { getFolderAlbums } from "../../media";
import { lock } from "../../../shared/lib/mutex";
import { Queue } from "../../../shared/lib/queue";
import { AlbumEntry } from "../../../shared/types/types";
import { getIndexingDatabaseReadWrite } from "./database";

const debugLogger = debug("app:bg-indexing");

/**
 * Set up event listeners for forwarded ServerEvents
 * Updates the search index (including FTS) when files are added, removed, or metadata changes
 */
function setupEventListeners(): void {
  debugLogger("Setting up event listeners for search index updates");
  const db = getIndexingDatabaseReadWrite();

  // Handle albumEntryAdded - index new files
  events.on("albumEntryAdded", async (entry: AlbumEntry) => {
    try {
      await waitUntilIdle();
      debugLogger(`Indexing new file: ${entry.name}`);
      await db.indexPicture(entry);
    } catch (error) {
      debugLogger(`Error indexing ${entry.name}:`, error);
    }
  });

  // Handle albumEntryRemoved - remove deleted files
  events.on("albumEntryRemoved", async (entry: AlbumEntry) => {
    try {
      debugLogger(`Removing deleted file from index: ${entry.name}`);
      await db.removePicture(entry);
    } catch (error) {
      debugLogger(`Error removing ${entry.name} from index:`, error);
    }
  });

  // Handle captionChanged - update entry when caption changes
  events.on("captionChanged", async (event: { entry: any }) => {
    try {
      const { entry } = event;
      debugLogger(`Updating database for entry ${entry.name} (caption changed)`);
      await db.updateEntry(entry, entry.metadata);
    } catch (error) {
      debugLogger("Error handling captionChanged event:", error);
    }
  });

  // Handle picasaEntryUpdated - update entry when metadata changes
  events.on("picasaEntryUpdated", async (event: { entry: any; field: string; value: any }) => {
    try {
      const { entry, field } = event;

      // Only update if the field is one we care about (geoPOI is now handled via geoDataFound event)
      const relevantFields = ['starCount', 'photostar', 'text', 'caption', 'persons'];
      if (relevantFields.includes(field)) {
        debugLogger(`Updating database for entry ${entry.name}, field: ${field}`);
        await db.updateEntry(entry, entry.metadata);
      }
    } catch (error) {
      debugLogger("Error handling picasaEntryUpdated event:", error);
    }
  });

  // Handle geoDataFound - update geo POI in search index when geo data becomes available
  events.on("geoDataFound", async (entry: AlbumEntry) => {
    try {
      await waitUntilIdle();
      debugLogger(`Updating geo POI in search index for entry: ${entry.name}`);
      await db.updateGeoPOI(entry);
    } catch (error) {
      debugLogger(`Error updating geo POI for ${entry.name} in search index:`, error);
    }
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
  const albums = await getFolderAlbums();
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
          await db.indexPicture(entry);
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
  const db = getIndexingDatabaseReadWrite();

  // From now on, we are ready to index
  for (const album of await getFolderAlbums()) {
    const m = await media(album);
    for (const entry of m.entries) {
      await db.indexPicture(entry);
    }
  }

  // Set up event listeners for forwarded ServerEvents
  setupEventListeners();
}

/**
 * Start the indexing worker
 */
export async function startWorker(): Promise<void> {
  await indexPictures();
}

// Initialize worker if running in a worker thread
if (parentPort && workerData?.serviceName === 'search') {
  const serviceName = workerData.serviceName;
  console.info(`Worker thread started for service: ${serviceName}`);
  startWorker().catch((error) => {
    console.error(`Error starting worker ${serviceName}:`, error);
    process.exit(1);
  });
}

