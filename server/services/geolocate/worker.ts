import { parentPort, workerData } from "worker_threads";
import { AlbumEntry, AlbumKind } from "../../../shared/types/types";
import { getExifData } from "../../rpc/rpcFunctions/exif";
import { getAllFolders, getAlbumEntries } from "../search/queries";
import { getLocations } from "./poi/poi-database";
import { initPOIDB } from "./poi/ingest";
import { getGeolocateDatabaseReadWrite } from "./database";
import { events } from "../../events/server-events";
import { waitUntilIdle } from "../../utils/busy";
import { Queue } from "../../../shared/lib/queue";
import debug from "debug";

const debugLogger = debug("app:bg-geolocate");

/**
 * Set up event listeners for forwarded ServerEvents
 */
function setupEventListeners(): void {
  debugLogger("Setting up event listeners for forwarded ServerEvents");
  const db = getGeolocateDatabaseReadWrite();

  // Handle albumEntryAdded - add new files to database
  events.on("albumEntryAdded", async (entry: AlbumEntry) => {
    try {
      await waitUntilIdle();
      debugLogger(`Adding new file to geolocate database: ${entry.name}`);
      db.upsertEntry(entry);
      // Don't queue processing here - wait for exifDataProcessed event
    } catch (error) {
      debugLogger(`Error handling albumEntryAdded for ${entry.name}:`, error);
    }
  });

  // Handle albumEntryRemoved - remove deleted files
  events.on("albumEntryRemoved", async (entry: AlbumEntry) => {
    try {
      debugLogger(`Removing deleted file from geolocate database: ${entry.name}`);
      db.removeEntry(entry);
    } catch (error) {
      debugLogger(`Error removing ${entry.name} from geolocate database:`, error);
    }
  });

  // Handle exifDataProcessed - process geo POI when EXIF data becomes available
  events.on("exifDataProcessed", async (entry: AlbumEntry) => {
    try {
      await waitUntilIdle();
      debugLogger(`EXIF data processed for ${entry.name}, queuing geo POI processing`);
      // Queue geo POI processing now that EXIF data is available
      queueGeoPOIProcessing(entry);
    } catch (error) {
      debugLogger(`Error handling exifDataProcessed for ${entry.name}:`, error);
    }
  });

  debugLogger("Event listeners set up successfully");
}

// Queue for processing geo POI extraction
const geoPOIProcessingQueue = new Queue(3);

/**
 * Queue geo POI processing for an entry
 */
function queueGeoPOIProcessing(entry: AlbumEntry): void {
  geoPOIProcessingQueue.add(async () => {
    await waitUntilIdle();
    await processGeoPOI(entry);
  });
}

/**
 * Process geo POI for an entry and update the database
 * This is called when EXIF data becomes available (via exifDataProcessed event)
 */
async function processGeoPOI(entry: AlbumEntry): Promise<void> {
  const db = getGeolocateDatabaseReadWrite();
  try {
    debugLogger(`Processing geo POI for ${entry.name}`);
    const exif = getExifData(entry);

    // Since we're called from exifDataProcessed event, EXIF should always be processed
    // But check anyway to be safe
    if (exif === null) {
      debugLogger(`EXIF data still not available for ${entry.name}, skipping...`);
      return;
    }

    // exif is now either an empty object {} (processed but no EXIF) or has data
    const { GPSLatitude, GPSLatitudeRef, GPSLongitudeRef, GPSLongitude } = exif;

    if (
      GPSLatitude &&
      GPSLatitudeRef &&
      GPSLongitudeRef &&
      GPSLongitude
    ) {
      const latitude =
        (GPSLatitudeRef === "N" ? 1 : -1) *
        (GPSLatitude[0] + GPSLatitude[1] / 60 + GPSLatitude[2] / 3600);
      const longitude =
        (GPSLongitudeRef === "E" ? 1 : -1) *
        (GPSLongitude[0] + GPSLongitude[1] / 60 + GPSLongitude[2] / 3600);
      try {
        const geoPOI = await getLocations(latitude, longitude);
        const geoPOIJson = JSON.stringify(geoPOI);
        db.updateGeoPOI(entry, geoPOIJson);
        // Emit event that geo data was found (only if POI data exists)
        if (geoPOI && geoPOI.length > 0) {
          events.emit("geoDataFound", entry);
        }
      } catch (e) {
        debugLogger(`Error geolocating ${entry.name}:`, e);
        db.updateGeoPOI(entry, null);
      }
    } else {
      // Processed but no GPS coordinates - mark as processed with no POI
      db.updateGeoPOI(entry, null);
    }
  } catch (error) {
    debugLogger(`Error processing geo POI for ${entry.name}:`, error);
    db.updateGeoPOI(entry, null);
  }
}

/**
 * Initialize geolocate database with all album entries
 */
async function initializeGeolocateDatabase(): Promise<void> {
  debugLogger("Initializing geolocate database with all album entries...");
  const db = getGeolocateDatabaseReadWrite();

  const albums = getAllFolders();
  debugLogger(`Total albums to process: ${albums.length}`);

  let processedEntries = 0;
  for (const album of albums) {
    let entries: AlbumEntry[];
    try {
      entries = await getAlbumEntries(album);
    } catch (e) {
      debugLogger(`Album ${album.name} is gone, skipping...`);
      continue;
    }

    for (const entry of entries) {
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

  debugLogger(`Geolocate database initialization completed. Initialized ${processedEntries} entries.`);
}

/**
 * Process all unprocessed entries to extract geo POI data
 */
async function processUnprocessedEntries(): Promise<void> {
  debugLogger("Starting to process unprocessed geo POI entries...");
  const db = getGeolocateDatabaseReadWrite();
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
      await processGeoPOI(entry);
    });
  }

  await q.drain();
  clearInterval(progressInterval);
  debugLogger("Finished processing unprocessed geo POI entries");
}

/**
 * Main entry point for geolocate worker
 */
export async function buildGeolocation() {
  await initPOIDB();

  const db = getGeolocateDatabaseReadWrite();

  // Initialize database with all album entries (create rows with no geo POI data)
  await initializeGeolocateDatabase();

  // Start processing unprocessed entries
  await processUnprocessedEntries();

  // Set up event listeners for forwarded ServerEvents
  setupEventListeners();
}

/**
 * Start the geolocate worker
 */
export async function startWorker(): Promise<void> {
  await buildGeolocation();
}

// Initialize worker if running in a worker thread
if (parentPort && workerData?.serviceName === 'geolocate') {
  const serviceName = workerData.serviceName;
  console.info(`Worker thread started for service: ${serviceName}`);
  startWorker().catch((error) => {
    console.error(`Error starting worker ${serviceName}:`, error);
    process.exit(1);
  });
}
