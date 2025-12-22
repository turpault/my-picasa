import { populateExifData } from "../exif/worker";
import { buildFavoriteFolder } from "../favorites/worker";
import { buildExportsFolder } from "../icloud-export/worker";
import { buildThumbs } from "../thumbgen/worker";
import { indexPictures } from "../indexing/worker";

export async function startBackgroundTasksOnStart() {
  await Promise.all([
    indexPictures(),
    buildFavoriteFolder(),
    //await buildExportsFolder(); // disabled for now - too heavy
    populateExifData(),
    buildThumbs(),
  ]);

}