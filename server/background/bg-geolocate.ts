import { AlbumEntry } from "../../shared/types/types";
import { media } from "../rpc/rpcFunctions/albumUtils";
import { exifData } from "../rpc/rpcFunctions/exif";
import {
  getPicasaEntry,
  updatePicasaEntry,
} from "../rpc/rpcFunctions/picasa-ini";
import { getFolderAlbums, waitUntilWalk } from "../walker";
import { getLocations } from "./poi/get-poi";
import { initPOIDB } from "./poi/ingest";
import { startRedis, stopRedis } from "./redis-process";

const debug = require("debug")("app:bg-geolocate");

export async function buildGeolocation() {
  await startRedis();
  await Promise.all([initPOIDB(), waitUntilWalk()]);

  const albums = await getFolderAlbums();
  for (const album of albums.reverse()) {
    debug("buildGeolocation: Processing album", album.name);
    let m: { entries: AlbumEntry[] };
    try {
      m = await media(album);
    } catch (e) {
      // Yuck folder is gone...
      continue;
    }
    await Promise.all(
      m.entries.map(async (entry) => {
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
  stopRedis();
}
