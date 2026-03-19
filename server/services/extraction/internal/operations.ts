import debug from "debug";
import { waitUntilIdle } from "../../../utils/busy";
import { AlbumEntry, AlbumEntryMetaData } from "../../../../shared/types/types";
import { getExifDatabaseReadOnly, getExifDatabaseReadWrite } from "../../exif/database";
import { getGeolocateDatabaseReadOnly, getGeolocateDatabaseReadWrite } from "../../geolocate/database";
import { getIndexingDatabaseReadWrite } from "../../search/database";
import { initPOIDB } from "../../geolocate/poi";
const debugLogger = debug("app:bg-extraction");

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

export async function runUpdateEntryJob(entry: AlbumEntry, metadata: AlbumEntryMetaData): Promise<void> {
  await waitUntilIdle();
  const db = getIndexingDatabaseReadWrite();
  try {
    await db.updateEntry(entry, metadata);
  } catch (error) {
    debugLogger(`Error updating entry ${entry.name} in index:`, error);
  }
}

export async function runExtractionWorker(): Promise<void> {
  await initPOIDB();

  // Open DBs (read-only for exif/geo; indexing needs read-write for FTS integrity check)
  getExifDatabaseReadOnly();
  getGeolocateDatabaseReadOnly();
  getIndexingDatabaseReadWrite();
}
