import exifr from "exifr";
import { Stats } from "fs";
import { readFile, stat } from "fs/promises";
import debug from "debug";
import { parentPort, workerData } from "worker_threads";
import { events } from "../../events/server-events";
import { media } from "../../rpc/rpcFunctions/albumUtils";
import { waitUntilIdle } from "../../utils/busy";
import { getFolderAlbums } from "../../media";
import { lock } from "../../../shared/lib/mutex";
import { Queue } from "../../../shared/lib/queue";
import { buildReadySemaphore, setReady } from "../../../shared/lib/utils";
import { isPicture, isVideo } from "../../../shared/lib/utils";
import { AlbumEntry, AlbumKind, ExifData, ExifTag } from "../../../shared/types/types";
import { dimensionsFromFileBuffer } from "../../imageOperations/sharp-processor";
import { entryFilePath } from "../../utils/serverUtils";
import { getExifDatabaseReadWrite } from "./database";

const debugLogger = debug("app:bg-exif");
const readyLabel = "exifReady";
const isReady = buildReadySemaphore(readyLabel);

/**
 * Set up event listeners for forwarded ServerEvents
 */
function setupEventListeners(): void {
  debugLogger("Setting up event listeners for forwarded ServerEvents");
  const db = getExifDatabaseReadWrite();

  // Handle albumEntryAdded - add new files to database and queue EXIF extraction
  events.on("albumEntryAdded", async (entry: AlbumEntry) => {
    try {
      await waitUntilIdle();
      debugLogger(`Adding new file to EXIF database: ${entry.name}`);
      db.upsertEntry(entry);
      // Queue EXIF data extraction
      queueExifExtraction(entry);
    } catch (error) {
      debugLogger(`Error handling albumEntryAdded for ${entry.name}:`, error);
    }
  });

  // Handle albumEntryRemoved - remove deleted files
  events.on("albumEntryRemoved", async (entry: AlbumEntry) => {
    try {
      debugLogger(`Removing deleted file from EXIF database: ${entry.name}`);
      db.removeEntry(entry);
    } catch (error) {
      debugLogger(`Error removing ${entry.name} from EXIF database:`, error);
    }
  });

  debugLogger("Event listeners set up successfully");
}

// Queue for processing EXIF extraction
const exifProcessingQueue = new Queue(3);

/**
 * Queue EXIF data extraction for an entry
 */
function queueExifExtraction(entry: AlbumEntry): void {
  exifProcessingQueue.add(async () => {
    await waitUntilIdle();
    await extractExifData(entry);
  });
}

/**
 * Filter EXIF tags to only include recognized ExifTag values
 */
function filterExifTags(tags: any): any {
  const filtered: { [tag: string]: any } = {};
  for (const key in tags) {
    if (tags[key] && (ExifTag as any)[key]) {
      filtered[key] = tags[key];
    }
  }
  return filtered;
}

/**
 * Extract EXIF data from a file
 */
async function extractExifDataFromFile(entry: AlbumEntry, withStats = false): Promise<any> {
  let exif: any;

  if (isPicture(entry)) {
    const path = entryFilePath(entry);
    const r = await lock(`exifData/${path}`);
    try {
      // Extract from file
      const fileData = await readFile(path);
      const tags = await exifr.parse(fileData).catch((e: any) => {
        debugLogger(`Exception while reading exif for ${path}: ${e}`);
        return {};
      });
      const dimensions = dimensionsFromFileBuffer(fileData);
      const filtered: ExifData = {
        ...filterExifTags(tags || {}),
        imageWidth: dimensions.width,
        imageHeight: dimensions.height,
      };
      exif = filtered;
    } finally {
      r();
    }
  } else if (isVideo(entry)) {
    exif = {};
  }

  if (withStats) {
    const path = entryFilePath(entry);
    const stats = await stat(path);
    exif = { ...exif, ...stats };
  }

  return exif;
}

/**
 * Extract EXIF data for an entry and update the database
 */
async function extractExifData(entry: AlbumEntry): Promise<void> {
  const db = getExifDatabaseReadWrite();
  try {
    debugLogger(`Extracting EXIF data for ${entry.name}`);
    const exif = await extractExifDataFromFile(entry, false);
    // Always store as JSON string - use "{}" for empty EXIF data, not null
    const exifJson = exif && Object.keys(exif).length > 0 ? JSON.stringify(exif) : "{}";
    db.updateExifData(entry, exifJson);
    // Emit event that EXIF data has been processed
    events.emit("exifDataProcessed", entry);
  } catch (error) {
    debugLogger(`Error extracting EXIF data for ${entry.name}:`, error);
    // Mark as processed even if it failed - store empty JSON object
    db.updateExifData(entry, "{}");
    // Still emit event even if processing failed (entry is marked as processed)
    events.emit("exifDataProcessed", entry);
  }
}

/**
 * Initialize EXIF database with all album entries
 */
async function initializeExifDatabase(): Promise<void> {
  debugLogger("Initializing EXIF database with all album entries...");
  const l = await lock("initializeExifDatabase");
  const db = getExifDatabaseReadWrite();

  const albums = await getFolderAlbums();
  debugLogger(`Total albums to process: ${albums.length}`);

  let processedEntries = 0;
  for (const album of albums) {
    let m: { entries: AlbumEntry[] };
    try {
      m = await media(album);
    } catch (e) {
      debugLogger(`Album ${album.name} is gone, skipping...`);
      continue;
    }

    for (const entry of m.entries) {
      try {
        db.upsertEntry(entry);
        processedEntries++;
        if (processedEntries % 100 === 0) {
          debugLogger(`Initialized ${processedEntries} entries (${albums.length} albums)`);
        }
      } catch (error) {
        debugLogger(`Error initializing entry ${entry.name}:`, error);
      }
    }
  }

  debugLogger(`EXIF database initialization completed. Initialized ${processedEntries} entries.`);
  l();
}

/**
 * Process all unprocessed entries to extract EXIF data
 */
async function processUnprocessedEntries(): Promise<void> {
  debugLogger("Starting to process unprocessed EXIF entries...");
  const db = getExifDatabaseReadWrite();
  const unprocessed = db.getUnprocessedEntries();

  if (unprocessed.length === 0) {
    debugLogger("No unprocessed entries to process");
    return;
  }

  debugLogger(`Found ${unprocessed.length} unprocessed entries`);
  const q = new Queue(3);

  // Progress monitoring
  const progressInterval = setInterval(() => {
    if (q.total() > 0) {
      debugLogger(
        `Processing progress: ${Math.floor((q.done() * 100) / q.total())}% (${q.done()} done)`
      );
    }
  }, 2000);

  for (const { album_key, album_name, entry_name } of unprocessed) {
    q.add(async () => {
      await waitUntilIdle();
      const entry: AlbumEntry = {
        name: entry_name,
        album: {
          key: album_key,
          name: album_name,
          kind: AlbumKind.FOLDER
        }
      };
      await extractExifData(entry);
    });
  }

  await q.drain();
  clearInterval(progressInterval);
  debugLogger("Finished processing unprocessed EXIF entries");
}

/**
 * Main entry point for EXIF worker
 */
export async function processExifData(): Promise<void> {
  // Initialize database (read-write in EXIF worker)
  const db = getExifDatabaseReadWrite();

  // Initialize database with all album entries (create rows with no EXIF data)
  await initializeExifDatabase();

  // Start processing unprocessed entries
  await processUnprocessedEntries();

  // Set up event listeners for forwarded ServerEvents
  setupEventListeners();

  setReady(readyLabel);
}

/**
 * Start the EXIF worker
 */
export async function startWorker(): Promise<void> {
  await processExifData();
}

export async function exifReady(): Promise<void> {
  return isReady;
}

// Initialize worker if running in a worker thread
if (parentPort && workerData?.serviceName === 'exif') {
  const serviceName = workerData.serviceName;
  console.info(`Worker thread started for service: ${serviceName}`);
  startWorker().catch((error) => {
    console.error(`Error starting worker ${serviceName}:`, error);
    process.exit(1);
  });
}
