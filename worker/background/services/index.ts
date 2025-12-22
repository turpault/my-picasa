import { populateExifData } from "../exif";
import { buildFaceScan } from "../faces";
import { buildFavoriteFolder } from "../favorites";
import { buildExportsFolder } from "../icloud-export";
import { buildGeolocation } from "../geolocate";
import { buildThumbs } from "../thumbgen";

export async function startBackgroundServices() {
  await buildFaceScan();
  await populateExifData();
  await buildGeolocation();
  await buildThumbs();
  await buildFavoriteFolder();
  await buildExportsFolder();
}
