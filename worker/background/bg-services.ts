import { populateExifData } from "./bg-exif";
import { buildFaceScan } from "./bg-faces";
import { buildFavoriteFolder } from "./bg-favorites";
import { buildExportsFolder } from "./bg-icloud-export";
import { buildGeolocation } from "./bg-geolocate";
import { buildThumbs } from "./bg-thumbgen";
import { startRedis, stopRedis } from "./redis-process";

export async function startBackgroundServices() {
  await startRedis();
  await buildFaceScan();
  await populateExifData();
  await buildGeolocation();
  await buildThumbs();
  await buildFavoriteFolder();
  await buildExportsFolder();
  await stopRedis();
}
