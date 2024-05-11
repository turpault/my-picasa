import { buildFaceScan } from "./bg-faces";
import { buildFavoriteFolder } from "./bg-favorites";
import { buildGeolocation } from "./bg-geolocate";
import { buildThumbs } from "./bg-thumbgen";

export async function startBackgroundServices() {
  await Promise.all([
    buildThumbs(),
    buildGeolocation(),
    buildFavoriteFolder(),
    buildFaceScan(),
  ]);
}
