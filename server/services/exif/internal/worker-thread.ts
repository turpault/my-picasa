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

function getFirstDefined(obj: any, ...paths: (string | [string, string])[]): unknown {
  for (const p of paths) {
    if (typeof p === "string") {
      const v = obj?.[p];
      if (v !== undefined && v !== null) return v;
    } else {
      const v = obj?.[p[0]]?.[p[1]];
      if (v !== undefined && v !== null) return v;
    }
  }
  return undefined;
}

/**
 * Extract well-known EXIF/XMP fields for separate DB columns
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

  // XMP / additional fields
  const personInImage = getFirstDefined(exif, ["Iptc4xmpExt", "PersonInImage"], ["iptcExt", "PersonInImage"], "PersonInImage");
  if (personInImage != null) {
    cols.person_in_image = Array.isArray(personInImage)
      ? JSON.stringify(personInImage)
      : String(personInImage);
  }

  const accel = getFirstDefined(exif, ["exifEX", "Acceleration"], ["ExifEX", "Acceleration"], "Acceleration");
  if (Array.isArray(accel) && accel.length >= 3) {
    cols.acceleration_vector = JSON.stringify(accel.slice(0, 3).map(Number));
  } else if (typeof accel === "number") {
    cols.acceleration_vector = JSON.stringify([accel]);
  }

  const photoId = getFirstDefined(exif, ["exifEX", "PhotoIdentifier"], "PhotoIdentifier", "ContentIdentifier", "ImageUniqueID");
  if (photoId != null) cols.photo_identifier = String(photoId);

  const imageUid = getFirstDefined(exif, ["exifEX", "ImageUniqueID"], "ImageUniqueID");
  if (imageUid != null) cols.image_unique_id = String(imageUid);

  const lensModel = getFirstDefined(exif, ["exifEX", "LensModel"], "LensModel");
  if (lensModel != null) cols.lens_model = String(lensModel);

  const lensInfo = getFirstDefined(exif, ["exifEX", "LensInfo"], "LensInfo");
  if (lensInfo != null) {
    cols.lens_info = Array.isArray(lensInfo)
      ? lensInfo.map(String).join(",")
      : String(lensInfo);
  }

  const fl35 = getFirstDefined(exif, ["exifEX", "FocalLengthIn35mmFormat"], "FocalLengthIn35mmFormat", "FocalLengthIn35mmFilm");
  if (typeof fl35 === "number" && !Number.isNaN(fl35)) cols.focal_length_35mm = Math.round(fl35);

  const gpsAlt = getFirstDefined(exif, "GPSAltitude");
  if (typeof gpsAlt === "number" && !Number.isNaN(gpsAlt)) cols.gps_altitude = gpsAlt;
  const gpsAltRef = getFirstDefined(exif, "GPSAltitudeRef");
  if (gpsAltRef != null) cols.gps_altitude_ref = String(gpsAltRef);
  const gpsDate = getFirstDefined(exif, "GPSDateStamp");
  if (gpsDate != null) cols.gps_date_stamp = String(gpsDate);
  const gpsDir = getFirstDefined(exif, "GPSImgDirection");
  if (typeof gpsDir === "number" && !Number.isNaN(gpsDir)) cols.gps_img_direction = gpsDir;
  const gpsDirRef = getFirstDefined(exif, "GPSImgDirectionRef");
  if (gpsDirRef != null) cols.gps_img_direction_ref = String(gpsDirRef);
  const gpsTs = getFirstDefined(exif, "GPSTimeStamp");
  if (gpsTs != null) cols.gps_timestamp = gpsTs instanceof Date ? gpsTs.toISOString() : String(gpsTs);

  return cols;
}

/** XMP tag names to preserve (from iptcExt, exifEX, dc, etc.) */
const XMP_TAGS = new Set([
  "PersonInImage", "Acceleration", "ImageUniqueID", "PhotoIdentifier",
  "LensModel", "LensInfo", "LensMake", "FocalLengthIn35mmFormat",
  "GPSAltitude", "GPSAltitudeRef", "GPSDateStamp", "GPSImgDirection",
  "GPSImgDirectionRef", "GPSTimeStamp", "ContentIdentifier",
  "subject", "Subject", // dc:subject
]);

/**
 * Filter EXIF tags to recognized ExifTag values and preserve XMP tags
 */
function filterExifTags(tags: any): any {
  const filtered: { [tag: string]: any } = {};
  for (const key in tags) {
    if (!tags[key]) continue;
    if ((ExifTag as any)[key] || XMP_TAGS.has(key)) {
      filtered[key] = tags[key];
    }
  }
  // Merge XMP namespaces (exifr may nest: Iptc4xmpExt, exifEX, etc.)
  for (const ns of ["Iptc4xmpExt", "iptcExt", "exifEX", "ExifEX", "dc", "aux"]) {
    const obj = tags?.[ns];
    if (obj && typeof obj === "object") {
      for (const k of Object.keys(obj)) {
        if (obj[k] != null && (XMP_TAGS.has(k) || (ExifTag as any)[k])) {
          filtered[k] = filtered[k] ?? obj[k];
        }
      }
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
      const tags = await exifr.parse(fileData, { xmp: true }).catch((e: any) => {
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

