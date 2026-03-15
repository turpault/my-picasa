import debug from "debug";
import { parentPort } from "worker_threads";
import { lock } from "../../../../shared/lib/mutex";
import { PriorityQueue } from "../../../../shared/lib/queue";
import { waitUntilIdle } from "../../../utils/busy";
import { sleep } from "../../../../shared/lib/utils";
import { AlbumEntry } from "../../../../shared/types/types";
import { events } from "../../../../shared/server-events";
import { media } from "../../../rpc/rpcFunctions/albumUtils";
import { getAllAlbums } from "../../walker/queries";
import { getExifDatabaseReadWrite } from "../../exif/internal/database";
import { getGeolocateDatabaseReadWrite } from "../../geolocate/internal/database";
import { getIndexingDatabaseReadWrite } from "../../search/internal/database";
import type { IndexingDatabaseAccess } from "../../search/internal/database";
import { extractExifData } from "../../exif/internal/worker-thread";
import { processGeoPOI } from "../../geolocate/internal/worker-thread";
import { initPOIDB } from "../../geolocate/internal/poi/ingest";
import { JOB_PRIORITY } from "../job-types";

const debugLogger = debug("app:bg-extraction");

const EXTRACTION_CONCURRENCY = 3;
const MAX_DB_RETRIES = 3;
const DB_RETRY_DELAY_MS = 500;

const extractionQueue = new PriorityQueue(EXTRACTION_CONCURRENCY, JOB_PRIORITY.OTHER);

function postQueueStats(): void {
  if (parentPort) {
    const stats = extractionQueue.getStats();
    parentPort.postMessage({ type: "extractionStats", data: stats });
  }
}

function isSqliteLockError(e: unknown): boolean {
  const err = e as { code?: string; message?: string };
  return (
    err?.code === "SQLITE_IOERR_LOCK" ||
    Boolean(err?.message?.includes("disk I/O error")) ||
    Boolean(err?.message?.includes("database is locked"))
  );
}

async function indexPictureWithRetry(
  db: IndexingDatabaseAccess,
  entry: AlbumEntry
): Promise<void> {
  for (let attempt = 0; attempt < MAX_DB_RETRIES; attempt++) {
    try {
      await db.indexPicture(entry);
      return;
    } catch (e) {
      if (attempt < MAX_DB_RETRIES - 1 && isSqliteLockError(e)) {
        await sleep(((attempt + 1) * DB_RETRY_DELAY_MS) / 1000);
      } else {
        throw e;
      }
    }
  }
}

/**
 * Run exif extraction job. extractExifData emits exifDataProcessed on completion,
 * which triggers enqueue of geo and index via event listener.
 */
async function runExifJob(entry: AlbumEntry): Promise<void> {
  await waitUntilIdle();
  await extractExifData(entry);
}

async function runGeoJob(entry: AlbumEntry): Promise<void> {
  await waitUntilIdle();
  await processGeoPOI(entry);
}

async function runIndexJob(entry: AlbumEntry): Promise<void> {
  await waitUntilIdle();
  const db = getIndexingDatabaseReadWrite();
  try {
    await indexPictureWithRetry(db, entry);
  } catch (error) {
    debugLogger(`Error indexing ${entry.name}:`, error);
  }
}

async function runRemoveJob(entry: AlbumEntry): Promise<void> {
  await waitUntilIdle();
  const exifDb = getExifDatabaseReadWrite();
  const geoDb = getGeolocateDatabaseReadWrite();
  const indexDb = getIndexingDatabaseReadWrite();
  try {
    exifDb.removeEntry(entry);
    geoDb.removeEntry(entry);
    await indexDb.removePicture(entry);
  } catch (error) {
    debugLogger(`Error removing ${entry.name} from extraction DBs:`, error);
  }
}

async function runUpdateEntryJob(entry: AlbumEntry, metadata: any): Promise<void> {
  await waitUntilIdle();
  const db = getIndexingDatabaseReadWrite();
  try {
    await db.updateEntry(entry, metadata);
  } catch (error) {
    debugLogger(`Error updating entry ${entry.name} in index:`, error);
  }
}

async function runUpdateGeoPOIJob(entry: AlbumEntry): Promise<void> {
  await waitUntilIdle();
  const db = getIndexingDatabaseReadWrite();
  try {
    await db.updateGeoPOI(entry);
  } catch (error) {
    debugLogger(`Error updating geo POI for ${entry.name} in index:`, error);
  }
}

function setupEventListeners(): void {
  debugLogger("Setting up extraction event listeners");

  events.on("albumEntryAdded", async (entry: AlbumEntry) => {
    try {
      await waitUntilIdle();
      debugLogger(`Queueing EXIF extraction for new file: ${entry.name}`);
      extractionQueue.add(() => runExifJob(entry), JOB_PRIORITY.EXIF);
    } catch (error) {
      debugLogger(`Error handling albumEntryAdded for ${entry.name}:`, error);
    }
  });

  events.on("albumEntryRemoved", async (entry: AlbumEntry) => {
    debugLogger(`Queueing removal of ${entry.name} from extraction DBs`);
    extractionQueue.add(() => runRemoveJob(entry), JOB_PRIORITY.OTHER);
  });

  events.on("captionChanged", async (event: { entry: any }) => {
    const { entry } = event;
    extractionQueue.add(
      () => runUpdateEntryJob(entry, entry.metadata),
      JOB_PRIORITY.OTHER
    );
  });

  events.on("picasaEntryUpdated", async (event: { entry: any; field: string; value: any }) => {
    const { entry, field } = event;
    const relevantFields = ["starCount", "photostar", "text", "caption", "persons"];
    if (relevantFields.includes(field)) {
      extractionQueue.add(
        () => runUpdateEntryJob(entry, entry.metadata),
        JOB_PRIORITY.OTHER
      );
    }
  });

  events.on("geoDataFound", async (entry: AlbumEntry) => {
    extractionQueue.add(() => runUpdateGeoPOIJob(entry), JOB_PRIORITY.OTHER);
  });

  events.on("exifDataProcessed", async (entry: AlbumEntry) => {
    extractionQueue.add(() => runGeoJob(entry), JOB_PRIORITY.GEO);
    extractionQueue.add(() => runIndexJob(entry), JOB_PRIORITY.OTHER);
  });

  debugLogger("Extraction event listeners set up");
}

async function processUnprocessedExif(): Promise<void> {
  const db = getExifDatabaseReadWrite();
  const unprocessed = db.getUnprocessedEntries();
  if (unprocessed.length === 0) return;

  debugLogger(`Queueing ${unprocessed.length} unprocessed EXIF entries`);
  for (const { album_key, album_name, entry_name } of unprocessed) {
    const entry: AlbumEntry = {
      name: entry_name,
      album: { key: album_key, name: album_name },
    };
    extractionQueue.add(() => runExifJob(entry), JOB_PRIORITY.EXIF);
  }
  await extractionQueue.drain();
}

async function processUnprocessedGeo(): Promise<void> {
  const db = getGeolocateDatabaseReadWrite();
  const unprocessed = db.getUnprocessedEntries();
  if (unprocessed.length === 0) return;

  debugLogger(`Queueing ${unprocessed.length} unprocessed geo POI entries`);
  for (const { album_key, album_name, entry_name } of unprocessed) {
    const entry: AlbumEntry = {
      name: entry_name,
      album: { key: album_key, name: album_name },
    };
    extractionQueue.add(() => runGeoJob(entry), JOB_PRIORITY.GEO);
  }
  await extractionQueue.drain();
}

async function indexAllPictures(): Promise<void> {
  debugLogger("Starting full picture indexing with mark-and-sweep...");
  const l = await lock("indexAllPictures");
  const db = getIndexingDatabaseReadWrite();

  db.clearAllMarks();

  const albums = await getAllAlbums();
  albums.sort((a, b) => b.name.localeCompare(a.name));

  for (const album of albums) {
    let m: { entries: AlbumEntry[] };
    try {
      m = await media(album);
    } catch (e) {
      debugLogger(`Album ${album.name} is gone, skipping...`);
      continue;
    }

    for (const entry of m.entries) {
      extractionQueue.add(() => runIndexJob(entry), JOB_PRIORITY.OTHER);
    }
  }

  await extractionQueue.drain();

  const removedCount = db.sweepUnmarkedRecords();
  debugLogger(`Picture indexing completed. Removed ${removedCount} orphaned records.`);
  l();
}

export async function runExtractionWorker(): Promise<void> {
  await initPOIDB();

  getExifDatabaseReadWrite();
  getGeolocateDatabaseReadWrite();
  getIndexingDatabaseReadWrite();

  if (parentPort) {
    parentPort.postMessage({ type: "ready" });
  }

  await processUnprocessedExif();
  await processUnprocessedGeo();
  await indexAllPictures();

  extractionQueue.event.on("changed", postQueueStats);
  postQueueStats();
  setupEventListeners();
}
