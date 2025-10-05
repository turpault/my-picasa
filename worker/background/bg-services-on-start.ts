import { populateExifData } from "./bg-exif";
import { buildFavoriteFolder } from "./bg-favorites";
import { buildThumbs } from "./bg-thumbgen";
import { startPictureIndexing } from "./bg-indexing";

export async function startBackgroundTasksOnStart() {
  await Promise.all([
    startPictureIndexing(),
    buildFavoriteFolder(),
    populateExifData(),
    buildThumbs(),
  ]);

}