import { buildFaceScan } from "./bg-faces";
import { buildFavoriteFolder } from "./bg-favorites";
//import { buildGeolocation } from "./bg-geolocate";
import { buildThumbs } from "./bg-thumbgen";

export async function startBackgroundServices(exitOnComplete: boolean) {
  await Promise.all([
    buildThumbs(exitOnComplete),
    //buildGeolocation(exitOnComplete),
    buildFavoriteFolder(exitOnComplete),
    buildFaceScan(exitOnComplete),
  ]);
}
