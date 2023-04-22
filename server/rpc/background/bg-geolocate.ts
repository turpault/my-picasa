https://nominatim.openstreetmap.org/reverse?format=json&lat=41.890251&lon=12.492373&addressdetails=1

import { bouncingBall } from "cli-spinners";
import { watch } from "fs";
import Spinnies from "spinnies";
import { isMediaUrl, sleep } from "../../../shared/lib/utils";
import { AlbumEntry, ThumbnailSizeVals } from "../../../shared/types/types";
import { isIdle } from "../../utils/busy";
import { imagesRoot } from "../../utils/constants";
import { imageInfo } from "../imageOperations/info";
import { media } from "../rpcFunctions/media";
import { makeThumbnail } from "../rpcFunctions/thumbnail";
import { folders, waitUntilWalk } from "../rpcFunctions/walker";
import { exifData } from "../rpcFunctions/exif";
import { readPicasaEntry, updatePicasaEntry } from "../rpcFunctions/picasaIni";

export async function buildGeolocation() {
  let spinnerName = Date.now().toString();
  await waitUntilWalk();
  let lastFSChange = new Date().getTime();
  watch(imagesRoot, { recursive: true }, (_eventType, filename) => {
    if (isMediaUrl(filename) && !filename.startsWith('.')) {
      lastFSChange = new Date().getTime();
    }
  });

  await sleep(10);
  while (true) {
    const albums = await folders("");
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
        const info = await readPicasaEntry(entry);
        if(info.geoPOI === undefined) {
          const info = await imageInfo(entry);

          if(info.meta.latitude !== undefined && info.meta.longitude !== undefined) {
            const lat = exif.gps.latitude[0] + exif.gps.latitude[1]/60 + exif.gps.latitude[2]/3600;
            const lon = exif.gps.longitude[0] + exif.gps.longitude[1]/60 + exif.gps.longitude[2]/3600;
            const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&addressdetails=1`;
            const response = await fetch(url);
            const data = await response.json();
            updatePicasaEntry(entry, 'geolocation',  data.address);
          }
        await Promise.all(
          // All size except large ones
          [...ThumbnailSizeVals.filter((f) => !f.includes("large")).map((size) => makeThumbnail(entry, size, true)), ...ThumbnailSizeVals.filter((f) => !f.includes("large")).map((size) => makeThumbnail(entry, size, false))]
        );          
      }
    }
    spinner.succeed(spinnerName, {
      text: `Scan done - will wait for updates`,
    });
    await sleep(20);
    const now = new Date().getTime();
    while (true) {
      await sleep(1);
      if (lastFSChange > now) break;
    }
    spinnerName = Date.now().toString();
    spinner.add(spinnerName, { text: "Changes detected, rescanning" });
  }
}
