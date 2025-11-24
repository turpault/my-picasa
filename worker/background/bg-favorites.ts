import { mkdir } from "fs/promises";
import { exportToFolder } from "../../server/imageOperations/export";
import { media } from "../../server/rpc/rpcFunctions/albumUtils";
import { getPicasaEntry } from "../../server/rpc/rpcFunctions/picasa-ini";
import { waitUntilIdle } from "../../server/utils/busy";
import { favoritesFolder } from "../../server/utils/constants";
import { fileExists } from "../../server/utils/serverUtils";
import { folders, waitUntilWalk } from "../../server/walker";
import { Queue } from "../../shared/lib/queue";

export async function buildFavoriteFolder() {
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
        const withMetadata = await getPicasaEntry(entry);
        if (!withMetadata.star) {
          continue;
        }
        q.add(async () => {
          await waitUntilIdle();
          exportToFolder(entry, favoritesFolder, { label: true, compress: true });
        });
      }
    });
  }
  await q.drain();
}
