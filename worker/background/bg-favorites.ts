import { mkdir } from "fs/promises";
import { join } from "path";
import { media } from "../../server/rpc/rpcFunctions/albumUtils";
import { exportFavorite } from "../../server/rpc/rpcFunctions/favorites";
import { waitUntilIdle } from "../../server/utils/busy";
import { imagesRoot } from "../../server/utils/constants";
import { fileExists } from "../../server/utils/serverUtils";
import { folders, waitUntilWalk } from "../../server/walker";
import { Queue } from "../../shared/lib/queue";

export async function buildFavoriteFolder() {
  const favoritesFolder = join(imagesRoot, "favorites");
  if (!(await fileExists(favoritesFolder))) {
    await mkdir(favoritesFolder, { recursive: true });
  }
  await waitUntilWalk();

  await exportAllMissing();
}

async function exportAllMissing() {
  // Job with no parameters
  const albums = await folders();
  const q = new Queue(10);
  for (const album of albums) {
    q.add(async () => {
      const m = await media(album);
      for (const entry of m.entries) {
        q.add(async () => {
          await waitUntilIdle();
          exportFavorite(entry);
        });
      }
    });
  }
  await q.drain();
}
