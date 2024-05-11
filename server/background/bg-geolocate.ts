import { getLocations } from "./poi/get-poi";
import { sleep } from "../../shared/lib/utils";
import { AlbumEntry } from "../../shared/types/types";
import { media } from "../rpc/rpcFunctions/albumUtils";
import { exifData } from "../rpc/rpcFunctions/exif";
import {
  getPicasaEntry,
  updatePicasaEntry,
} from "../rpc/rpcFunctions/picasa-ini";
import { isIdle } from "../utils/busy";
import { getFolderAlbums, waitUntilWalk } from "../walker";

export async function buildGeolocation() {
  await waitUntilWalk();

  const albums = await getFolderAlbums();
  for (const album of albums.reverse()) {
    let m: { entries: AlbumEntry[] };
    try {
      m = await media(album);
    } catch (e) {
      // Yuck folder is gone...
      continue;
    }
    for (const entry of m.entries) {
      while (!isIdle()) {
        await sleep(1);
      }
      const info = await getPicasaEntry(entry);
      if (info.geoPOI === undefined) {
        const exif = await exifData(entry);

         const {
           GPSLatitude,
           GPSLatitudeRef,
           GPSLongitudeRef,
           GPSLongitude,
         } = exif;

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
    }
  }
}