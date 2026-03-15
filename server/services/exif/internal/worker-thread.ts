import debug from "debug";
import exifr from "exifr";
import { readFile, stat } from "fs/promises";
import { parentPort } from "worker_threads";
import { lock } from "../../../../shared/lib/mutex";
import { Queue } from "../../../../shared/lib/queue";
import { buildReadySemaphore, isPicture, isVideo, setReady, sleep } from "../../../../shared/lib/utils";
import { events } from "../../../../shared/server-events";
import { AlbumEntry, ExifData, ExifTag } from "../../../../shared/types/types";
import { dimensionsFromFileBuffer } from "../../../imageOperations/sharp-processor";
import { waitUntilIdle } from "../../../utils/busy";
import { entryFilePath } from "../../../utils/serverUtils";
import type { ExifColumns } from "./database";
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

  // Handle albumEntryAdded - queue EXIF extraction for new files
  // Entry already exists in walker.album_entries, no need to create it in exif_data
  // Entry will be created in exif_data when EXIF is processed
  events.on("albumEntryAdded", async (entry: AlbumEntry) => {
    try {
      await waitUntilIdle();
      debugLogger(`New file added, queueing EXIF extraction: ${entry.name}`);
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
 * Extract well-known EXIF fields for separate DB columns
 */
function extractExifColumns(exif: any): ExifColumns {
  const cols: ExifColumns = {};
  if (!exif || typeof exif !== "object") return cols;

  const dateVal = exif.DateTimeOriginal ?? exif.CreateDate ?? exif.ModifyDate;
  if (dateVal) {
    const d = dateVal instanceof Date ? dateVal : new Date(dateVal);
    if (!isNaN(d.getTime())) cols.date_taken = d.toISOString();
  }

  if (exif.Make != null) cols.make = String(exif.Make);
  if (exif.Model != null) cols.model = String(exif.Model);

  const w = exif.imageWidth ?? exif.ExifImageWidth;
  const h = exif.imageHeight ?? exif.ExifImageHeight;
  if (typeof w === "number" && !Number.isNaN(w)) cols.image_width = Math.round(w);
  if (typeof h === "number" && !Number.isNaN(h)) cols.image_height = Math.round(h);

  const { GPSLatitude, GPSLatitudeRef, GPSLongitude, GPSLongitudeRef } = exif;
  if (
    Array.isArray(GPSLatitude) &&
    GPSLatitudeRef &&
    Array.isArray(GPSLongitude) &&
    GPSLongitudeRef
  ) {
    const tripletToDecimal = (arr: number[]) =>
      arr[0] + (arr[1] ?? 0) / 60 + (arr[2] ?? 0) / 3600;
    cols.latitude =
      (GPSLatitudeRef === "N" ? 1 : -1) * tripletToDecimal(GPSLatitude);
    cols.longitude =
      (GPSLongitudeRef === "E" ? 1 : -1) * tripletToDecimal(GPSLongitude);
  }

  if (typeof exif.ISO === "number" && !Number.isNaN(exif.ISO))
    cols.iso = Math.round(exif.ISO);
  if (typeof exif.ExposureTime === "number" && !Number.isNaN(exif.ExposureTime))
    cols.exposure_time = exif.ExposureTime;
  if (typeof exif.FNumber === "number" && !Number.isNaN(exif.FNumber))
    cols.f_number = exif.FNumber;
  if (typeof exif.FocalLength === "number" && !Number.isNaN(exif.FocalLength))
    cols.focal_length = exif.FocalLength;

  return cols;
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
        const msg = String(e?.message ?? e);
        if (msg.includes("Unknown file format") || msg.includes("Unknown")) {
          debugLogger(`Skipping unsupported format: ${path}`);
        } else {
          debugLogger(`Exception while reading exif for ${path}: ${e}`);
        }
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

const SQLITE_IOERR_LOCK = "SQLITE_IOERR_LOCK";
const MAX_DB_RETRIES = 3;
const DB_RETRY_DELAY_MS = 500;

function isSqliteLockError(e: unknown): boolean {
  const err = e as { code?: string; message?: string };
  return err?.code === SQLITE_IOERR_LOCK
    || Boolean(err?.message?.includes("disk I/O error"))
    || Boolean(err?.message?.includes("database is locked"));
}

/**
 * Extract EXIF data for an entry and update the database
 * Exported for use by the extraction worker.
 */
export async function extractExifData(entry: AlbumEntry): Promise<void> {
  const db = getExifDatabaseReadWrite();
  try {
    debugLogger(`Extracting EXIF data for ${entry.name}`);
    const exif = await extractExifDataFromFile(entry, false);
    const exifJson = exif && Object.keys(exif).length > 0 ? JSON.stringify(exif) : "{}";
    const columns = extractExifColumns(exif);
    await updateExifWithRetry(db, entry, exifJson, columns);
    events.emit("exifDataProcessed", entry);
  } catch (error) {
    debugLogger(`Error extracting EXIF data for ${entry.name}:`, error);
    try {
      await updateExifWithRetry(db, entry, "{}", {});
    } catch (fallbackError) {
      debugLogger(`Could not mark ${entry.name} as processed (DB may be locked):`, fallbackError);
    }
    events.emit("exifDataProcessed", entry);
  }
}

async function updateExifWithRetry(
  db: { updateExifData: (e: AlbumEntry, d: string, c?: ExifColumns) => void },
  entry: AlbumEntry,
  exifJson: string,
  columns?: ExifColumns,
): Promise<void> {
  for (let attempt = 0; attempt < MAX_DB_RETRIES; attempt++) {
    try {
      db.updateExifData(entry, exifJson, columns);
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

/**
 * Initialize EXIF database
 * No longer needed to manually create entries - they come from walker database
 * This function is kept for compatibility but does nothing since entries are sourced from walker.album_entries
 */
async function initializeExifDatabase(): Promise<void> {
  debugLogger("EXIF database initialization - entries are sourced from walker database");
  // Entries are now sourced from walker.album_entries via joins
  // No manual entry creation needed
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
          name: album_name
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
  // This will trigger database creation and migration
  const db = getExifDatabaseReadWrite();


  // Initialize database with all album entries (create rows with no EXIF data)
  await initializeExifDatabase();

  // Send ready message after database initialization
  if (parentPort) {
    parentPort.postMessage({ type: "ready" });
  }

  // Start processing unprocessed entries
  await processUnprocessedEntries();

  // Set up event listeners for forwarded ServerEvents
  setupEventListeners();

  setReady(readyLabel);
}

