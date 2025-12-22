import { populateExifData } from "../exif/worker";
import { buildFaceScan } from "../faces/worker";
import { buildFavoriteFolder } from "../favorites/worker";
import { buildExportsFolder } from "../icloud-export/worker";
import { buildGeolocation } from "../geolocate/worker";
import { buildThumbs } from "../thumbgen/worker";

export async function startBackgroundServices() {
  await buildFaceScan();
  await populateExifData();
  await buildGeolocation();
  await buildThumbs();
  await buildFavoriteFolder();
  await buildExportsFolder();
}
