import { mkdir, unlink } from "fs/promises";
import { extname, join } from "path";
import debug from "debug";
import { addJob } from "../../../utils/global-job-queue";
import { exportToFolder } from "../../../imageOperations/export";
import { getEntryMetadata, getAllAlbums, getAlbumEntries } from "../../walker/queries";
import { waitUntilIdle } from "../../../utils/busy";
import { favoritesFolder } from "../../../utils/constants";
import { fileExists } from "../../../utils/serverUtils";
import { Queue } from "../../../../shared/lib/queue";
import { RESIZE_ON_EXPORT_SIZE } from "../../../../shared/lib/shared-constants";
import { AlbumEntry } from "../../../../shared/types/types";
import { isVideo, namifyAlbumEntry } from "../../../../shared/lib/utils";
import { events } from "../../../../shared/server-events";
import type { JobType } from "../../extraction/job-types";

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

async function exportAllMissing(): Promise<void> {
  await mkdir(favoritesFolder, { recursive: true });
  const albums = getAllAlbums();
  const q = new Queue(10);
  for (const album of albums) {
    q.add(async () => {
      const entries = getAlbumEntries(album);
      for (const entry of entries) {
        const withMetadata = getEntryMetadata(entry);
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
  debugLogger("Setting up favorite-exporter event listeners");

  events.on("albumEntryAdded", async (entry: AlbumEntry) => {
    try {
      const metadata = getEntryMetadata(entry);
      if (!metadata.star) return;
      addJob(
        () => exportStarredEntry(entry),
        "FAVORITE_EXPORT" as JobType
      );
    } catch (error) {
      debugLogger(`Error handling albumEntryAdded for ${entry.name}:`, error);
    }
  });

  events.on("picasaEntryUpdated", async (event: { entry: AlbumEntry; field: string; value: unknown }) => {
    if (event.field !== "star") return;
    const entry = event.entry;
    if (event.value) {
      addJob(
        () => exportStarredEntry(entry),
        "FAVORITE_EXPORT" as JobType
      );
    } else {
      addJob(
        () => removeFromFavorites(entry),
        "FAVORITE_EXPORT" as JobType
      );
    }
  });

  debugLogger("Favorite-exporter event listeners set up");
}

/**
 * Initialize favorite-exporter: set up event listeners and run initial export when walker is ready.
 * Called from worker-manager.
 */
export function setupFavoriteExporter(getWalkerReadyPromise: () => Promise<void>): void {
  setupEventListeners();
  getWalkerReadyPromise().then(async () => {
    try {
      await mkdir(favoritesFolder, { recursive: true });
      await exportAllMissing();
      debugLogger("Initial favorites export completed");
    } catch (error) {
      debugLogger("Error in initial favorites export:", error);
    }
  });
}
