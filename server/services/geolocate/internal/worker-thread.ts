import { AlbumEntry } from "../../../../shared/types/types";
import { getExifData } from "../../../rpc/rpcFunctions/exif";
import { enqueueDb } from "../../../utils/db-queue";
import { getLocations } from "./poi/poi-database";
import { getGeolocateDatabaseReadWrite } from "./database";
import { events } from "../../../../shared/server-events";
import debug from "debug";

const debugLogger = debug("app:bg-geolocate");

/**
 * Process geo POI for an entry and update the database
 * This is called when EXIF data becomes available (via exifDataProcessed event).
 * Exported for use by the extraction worker.
 */
export async function processGeoPOI(entry: AlbumEntry): Promise<void> {
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
        await enqueueDb(
          () => db.updateGeoPOI(entry, geoPOIJson),
          `geolocate.updateGeoPOI(${entry.name})`
        );
        // Emit event that geo data was found (only if POI data exists)
        if (geoPOI && geoPOI.length > 0) {
          events.emit("geoDataFound", entry);
        }
      } catch (e) {
        debugLogger(`Error geolocating ${entry.name}:`, e);
        await enqueueDb(
          () => db.updateGeoPOI(entry, null),
          `geolocate.updateGeoPOI(${entry.name},null)`
        );
      }
    } else {
      // Processed but no GPS coordinates - mark as processed with no POI
      await enqueueDb(
        () => db.updateGeoPOI(entry, null),
        `geolocate.updateGeoPOI(${entry.name},noGPS)`
      );
    }
  } catch (error) {
    debugLogger(`Error processing geo POI for ${entry.name}:`, error);
    await enqueueDb(
      () => db.updateGeoPOI(entry, null),
      `geolocate.updateGeoPOI(${entry.name},error)`
    );
  }
}

