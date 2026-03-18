import { mkdir, unlink } from "fs/promises";
import { extname, join } from "path";
import debug from "debug";
import { exportToFolder } from "../../../imageOperations/export";
import { getEntryMetadata, getAllAlbums, getAlbumEntries } from "../../walker/queries";
import { waitUntilIdle } from "../../../utils/busy";
import { favoritesFolder } from "../../../utils/constants";
import { fileExists } from "../../../utils/serverUtils";
import { Queue } from "../../../../shared/lib/queue";
import { RESIZE_ON_EXPORT_SIZE } from "../../../../shared/lib/shared-constants";
import { AlbumEntry } from "../../../../shared/types/types";
import { isVideo, namifyAlbumEntry } from "../../../../shared/lib/utils";

const debugLogger = debug("app:favorite-exporter");

function getFavoritesExportFilename(entry: AlbumEntry): string {
  return namifyAlbumEntry(entry) + (isVideo(entry) ? extname(entry.name) : ".jpg");
}

function getFavoritesExportPath(entry: AlbumEntry): string {
  return join(favoritesFolder, getFavoritesExportFilename(entry));
}

async function exportStarredEntry(entry: AlbumEntry): Promise<void> {
  await waitUntilIdle();
  await exportToFolder(entry, favoritesFolder, {
    label: true,
    resize: RESIZE_ON_EXPORT_SIZE,
  });
}

async function removeFromFavorites(entry: AlbumEntry): Promise<void> {
  const targetPath = getFavoritesExportPath(entry);
  if (await fileExists(targetPath)) {
    await unlink(targetPath);
    debugLogger(`Removed from favorites: ${entry.name}`);
  }
}

export async function exportAllMissing(): Promise<void> {
  await mkdir(favoritesFolder, { recursive: true });
  const albums = await getAllAlbums();
  const q = new Queue(10);
  for (const album of albums) {
    q.add(async () => {
      const entries = await getAlbumEntries(album);
      for (const entry of entries) {
        const withMetadata = await getEntryMetadata(entry);
        if (!withMetadata.star) continue;
        q.add(async () => {
          await exportStarredEntry(entry);
        });
      }
    });
  }
  await q.drain();
}

function setupEventListeners(): void {
  // Favorite-export scheduling is handled by global-job-schedulers
  // (albumEntryAdded, picasaEntryUpdated for star field)
  debugLogger("Favorite-exporter event listeners delegated to global-job-schedulers");
}

/**
 * Initialize favorite-exporter: set up event listeners.
 * Export logic runs only in the worker thread (reader/writer split).
 * Called from worker-manager.
 */
export function setupFavoriteExporter(_getWalkerReadyPromise: () => Promise<void>): void {
  setupEventListeners();
}
