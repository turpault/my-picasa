import { populateExifData } from "./bg-exif";
import { buildFavoriteFolder } from "./bg-favorites";
import { buildExportsFolder } from "./bg-icloud-export";
import { buildThumbs } from "./bg-thumbgen";
import { indexPictures } from "./bg-indexing";

export async function startBackgroundTasksOnStart() {
  await Promise.all([
    indexPictures(),
    buildFavoriteFolder(),
    //await buildExportsFolder(); // disabled for now - too heavy
    populateExifData(),
    buildThumbs(),
  ]);

}