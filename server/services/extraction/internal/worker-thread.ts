import debug from "debug";
import { addJob } from "../../../utils/global-job-queue";
import { waitUntilIdle } from "../../../utils/busy";
import { AlbumEntry } from "../../../../shared/types/types";
import { getExifDatabaseReadWrite } from "../../exif/internal/database";
import { getGeolocateDatabaseReadWrite } from "../../geolocate/internal/database";
import { getIndexingDatabaseReadWrite } from "../../search/internal/database";
import { extractExifData } from "../../exif/internal/worker-thread";
import { initPOIDB } from "../../geolocate/internal/poi/ingest";
const debugLogger = debug("app:bg-extraction");

/**
 * Run EXIF extraction job. GEO and INDEX are handled by background workers.
 */
export async function runExifJob(entry: AlbumEntry): Promise<void> {
  await waitUntilIdle();
  await extractExifData(entry);
}

export async function runRemoveJob(entry: AlbumEntry): Promise<void> {
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

export async function runUpdateEntryJob(entry: AlbumEntry, metadata: any): Promise<void> {
  await waitUntilIdle();
  const db = getIndexingDatabaseReadWrite();
  try {
    await db.updateEntry(entry, metadata);
  } catch (error) {
    debugLogger(`Error updating entry ${entry.name} in index:`, error);
  }
}

function setupEventListeners(): void {
  debugLogger("Setting up extraction event listeners");

  // EXIF scheduling is handled by global-job-schedulers (albumEntryAdded, albumEntryFileChanged)
  // albumEntryRemoved: scheduleRemoveJob called from reindex (walker)
  // captionChanged, picasaEntryUpdated: scheduleUpdateEntryJob called from mutations (walker)
  // GEO and INDEX: handled by geolocate and FTS workers; FTS does full index with geo from getGeoPOI

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

export async function runExtractionWorker(): Promise<void> {
  await initPOIDB();

  getExifDatabaseReadWrite();
  getGeolocateDatabaseReadWrite();
  getIndexingDatabaseReadWrite();

  await processUnprocessedExif();

  setupEventListeners();
}
