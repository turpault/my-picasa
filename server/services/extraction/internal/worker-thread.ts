import debug from "debug";
import { lock } from "../../../../shared/lib/mutex";
import { addJob } from "../../../utils/global-job-queue";
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
const debugLogger = debug("app:bg-extraction");

const MAX_DB_RETRIES = 3;
const DB_RETRY_DELAY_MS = 500;

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
      addJob(() => runExifJob(entry), "EXIF");
    } catch (error) {
      debugLogger(`Error handling albumEntryAdded for ${entry.name}:`, error);
    }
  });

  events.on("albumEntryRemoved", async (entry: AlbumEntry) => {
    debugLogger(`Queueing removal of ${entry.name} from extraction DBs`);
    addJob(() => runRemoveJob(entry), "REMOVE");
  });

  events.on("captionChanged", async (event: { entry: any }) => {
    const { entry } = event;
    addJob(() => runUpdateEntryJob(entry, entry.metadata), "UPDATE_ENTRY");
  });

  events.on("picasaEntryUpdated", async (event: { entry: any; field: string; value: any }) => {
    const { entry, field } = event;
    const relevantFields = ["starCount", "photostar", "text", "caption", "persons"];
    if (relevantFields.includes(field)) {
      addJob(() => runUpdateEntryJob(entry, entry.metadata), "UPDATE_ENTRY");
    }
  });

  events.on("geoDataFound", async (entry: AlbumEntry) => {
    addJob(() => runUpdateGeoPOIJob(entry), "UPDATE_GEO_POI");
  });

  events.on("exifDataProcessed", async (entry: AlbumEntry) => {
    // GEO runs outside global queue per plan - run directly
    void runGeoJob(entry);
    addJob(() => runIndexJob(entry), "INDEX");
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
    addJob(() => runExifJob(entry), "EXIF");
  }
  const { drainGlobalQueue } = await import("../../../utils/global-job-queue");
  await drainGlobalQueue();
}

async function processUnprocessedGeo(): Promise<void> {
  const db = getGeolocateDatabaseReadWrite();
  const unprocessed = db.getUnprocessedEntries();
  if (unprocessed.length === 0) return;

  debugLogger(`Processing ${unprocessed.length} unprocessed geo POI entries (outside global queue)`);
  for (const { album_key, album_name, entry_name } of unprocessed) {
    const entry: AlbumEntry = {
      name: entry_name,
      album: { key: album_key, name: album_name },
    };
    await runGeoJob(entry);
  }
}

async function processEntriesNeedingReindex(): Promise<void> {
  const db = getIndexingDatabaseReadWrite();
  const entries = db.getEntriesNeedingReindex();
  if (entries.length === 0) return;

  debugLogger(`Queueing ${entries.length} entries needing reindex (version mismatch)`);
  for (const { album_key, album_name, entry_name } of entries) {
    const entry: AlbumEntry = {
      name: entry_name,
      album: { key: album_key, name: album_name },
    };
    addJob(() => runIndexJob(entry), "INDEX");
  }
  const { drainGlobalQueue } = await import("../../../utils/global-job-queue");
  await drainGlobalQueue();
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
      addJob(() => runIndexJob(entry), "INDEX");
    }
  }

  const { drainGlobalQueue } = await import("../../../utils/global-job-queue");
  await drainGlobalQueue();

  const removedCount = db.sweepUnmarkedRecords();
  debugLogger(`Picture indexing completed. Removed ${removedCount} orphaned records.`);
  l();
}

export async function runExtractionWorker(): Promise<void> {
  await initPOIDB();

  getExifDatabaseReadWrite();
  getGeolocateDatabaseReadWrite();
  getIndexingDatabaseReadWrite();

  await processUnprocessedExif();
  await processUnprocessedGeo();
  await processEntriesNeedingReindex();
  await indexAllPictures();

  setupEventListeners();
}
