import { parentPort, workerData } from "worker_threads";
import { AlbumEntry } from "../../../shared/types/types";
import { exifData } from "../../rpc/rpcFunctions/exif";
import {
  getPicasaEntry,
  updatePicasaEntry,
} from "../../rpc/rpcFunctions/picasa-ini";
import { getAllFolders, getAlbumEntries } from "../search/queries";
import { getLocations } from "./poi/get-poi";
import { initPOIDB } from "./poi/ingest";
// import { startRedis, stopRedis } from "./redis-process";
import debug from "debug";

const debugLogger = debug("app:bg-geolocate");

export async function buildGeolocation() {
  await initPOIDB();

  const albums = getAllFolders();
  for (const album of albums.reverse()) {
    debugLogger("buildGeolocation: Processing album", album.name);
    let entries: AlbumEntry[];
    try {
      entries = await getAlbumEntries(album);
    } catch (e) {
      // Yuck folder is gone...
      continue;
    }
    await Promise.all(
      entries.map(async (entry) => {
        const info = await getPicasaEntry(entry);
        if (info.geoPOI === undefined) {
          const exif = await exifData(entry, false /* no stats */);

          const { GPSLatitude, GPSLatitudeRef, GPSLongitudeRef, GPSLongitude } =
            exif;

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
              updatePicasaEntry(entry, "geoPOI", JSON.stringify(geoPOI));
            } catch (e) {
              console.log("Error geolocating", entry.name, e);
            }
          } else {
            updatePicasaEntry(entry, "geoPOI", JSON.stringify({}));
          }
        }
      }),
    );
  }
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
