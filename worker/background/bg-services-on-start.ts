import { populateExifData } from "./bg-exif";
import { buildFavoriteFolder } from "./bg-favorites";
import { buildThumbs } from "./bg-thumbgen";

export async function startBackgroundTasksOnStart() {
  await buildFavoriteFolder();
  await populateExifData();
  await buildThumbs();
}