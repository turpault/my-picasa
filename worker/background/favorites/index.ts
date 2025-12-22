import { mkdir } from "fs/promises";
import { exportToFolder } from "../../server/imageOperations/export";
import { getPicasaEntry } from "../../server/rpc/rpcFunctions/picasa-ini";
import { waitUntilIdle } from "../../server/utils/busy";
import { favoritesFolder } from "../../server/utils/constants";
import { fileExists } from "../../server/utils/serverUtils";
import { Queue } from "../../shared/lib/queue";
import { RESIZE_ON_EXPORT_SIZE } from "../../shared/lib/shared-constants";
import { getAlbumEntries, getAllFolders, indexingReady } from "../indexing";

export async function buildFavoriteFolder() {
  if (!(await fileExists(favoritesFolder))) {
    await mkdir(favoritesFolder, { recursive: true });
  }
  await indexingReady();
  await exportAllMissing();
}

async function exportAllMissing() {
  // Job with no parameters
  const albums = getAllFolders();
  const q = new Queue(10);
  for (const album of albums) {
    q.add(async () => {
      let entries;
      try {
        entries = await getAlbumEntries(album);
      } catch (e) {
        return;
      }
      for (const entry of entries) {
        const withMetadata = await getPicasaEntry(entry);
        if (!withMetadata.star) {
          continue;
        }
        q.add(async () => {
          await waitUntilIdle();
          exportToFolder(entry, favoritesFolder, { label: true, resize: RESIZE_ON_EXPORT_SIZE });
        });
      }
    });
  }
  await q.drain();
}
