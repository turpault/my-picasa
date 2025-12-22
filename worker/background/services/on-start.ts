import { populateExifData } from "../exif";
import { buildFavoriteFolder } from "../favorites";
import { buildExportsFolder } from "../icloud-export";
import { buildThumbs } from "../thumbgen";
import { indexPictures } from "../indexing";

export async function startBackgroundTasksOnStart() {
  await Promise.all([
    indexPictures(),
    buildFavoriteFolder(),
    //await buildExportsFolder(); // disabled for now - too heavy
    populateExifData(),
    buildThumbs(),
  ]);

}