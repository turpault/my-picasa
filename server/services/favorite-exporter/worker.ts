import { mkdir } from "fs/promises";
import { parentPort, workerData } from "worker_threads";
import { exportToFolder } from "../../imageOperations/export";
import { getPicasaEntry } from "../../rpc/rpcFunctions/picasa-ini";
import { waitUntilIdle } from "../../utils/busy";
import { favoritesFolder } from "../../utils/constants";
import { fileExists } from "../../utils/serverUtils";
import { Queue } from "../../../shared/lib/queue";
import { RESIZE_ON_EXPORT_SIZE } from "../../../shared/lib/shared-constants";
import { getAlbumEntries, getAllFolders } from "../search/queries";

export async function buildFavoriteFolder() {
  if (!(await fileExists(favoritesFolder))) {
    await mkdir(favoritesFolder, { recursive: true });
  }
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

/**
 * Start the favorite-exporter worker
 */
export async function startWorker(): Promise<void> {
  await buildFavoriteFolder();
}

// Initialize worker if running in a worker thread
if (parentPort && workerData?.serviceName === 'favorite-exporter') {
  const serviceName = workerData.serviceName;
  console.info(`Worker thread started for service: ${serviceName}`);
  startWorker()
    .then(() => {
      console.info(`Worker ${serviceName} completed successfully`);
      process.exit(0);
    })
    .catch((error) => {
      console.error(`Worker ${serviceName} exited with error:`, error);
      process.exit(1);
    });

  // Handle uncaught exceptions
  process.on('uncaughtException', (error) => {
    console.error(`Worker ${serviceName} uncaught exception:`, error);
    process.exit(1);
  });

  // Handle unhandled promise rejections
  process.on('unhandledRejection', (reason, promise) => {
    console.error(`Worker ${serviceName} unhandled rejection at:`, promise, 'reason:', reason);
    process.exit(1);
  });
}
