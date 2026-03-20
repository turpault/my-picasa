import { mkdir, readdir, unlink } from "fs/promises";
import { extname, join } from "path";
import debug from "debug";
import { exportToFolder } from "../../../imageOperations/export";
import {
  getFavoritesDbPageSize,
  getFavoritesExportConcurrency,
  getFavoritesRunMaxMs,
} from "../../../config/worker-batch-config";
import { favoritesFolder } from "../../../utils/constants";
import { createRunDeadline } from "../../../utils/run-deadline";
import { fileExists } from "../../../utils/serverUtils";
import { Queue } from "../../../../shared/lib/queue";
import { RESIZE_ON_EXPORT_SIZE } from "../../../../shared/lib/shared-constants";
import { AlbumEntry } from "../../../../shared/types/types";
import { isVideo, namifyAlbumEntry } from "../../../../shared/lib/utils";
import { getEntriesDatabase } from "../../entries/internal/database";

const debugLogger = debug("app:favorite-exporter");

function getFavoritesExportFilename(entry: AlbumEntry): string {
  return namifyAlbumEntry(entry) + (isVideo(entry) ? extname(entry.name) : ".jpg");
}

function getFavoritesExportPath(entry: AlbumEntry): string {
  return join(favoritesFolder, getFavoritesExportFilename(entry));
}

async function exportStarredEntry(entry: AlbumEntry): Promise<void> {
  await exportToFolder(entry, favoritesFolder, {
    label: true,
    resize: RESIZE_ON_EXPORT_SIZE,
  });
}

export type ExportFavoritesOptions = {
  runMaxMs?: number;
  exportConcurrency?: number;
  dbPageSize?: number;
};

/**
 * Sync `.favorites` with starred rows in picisa_entries.db: remove orphan files,
 * export missing starred entries. Bounded by wall time and export concurrency.
 */
export async function exportAllMissing(options?: ExportFavoritesOptions): Promise<void> {
  const runMaxMs = options?.runMaxMs ?? getFavoritesRunMaxMs();
  const exportConcurrency = options?.exportConcurrency ?? getFavoritesExportConcurrency();
  const dbPageSize = options?.dbPageSize ?? getFavoritesDbPageSize();
  const deadline = createRunDeadline(runMaxMs);
  const db = getEntriesDatabase();

  await mkdir(favoritesFolder, { recursive: true });

  const expectedFilenames = new Set<string>();
  let off = 0;
  while (true) {
    const batch = await db.listStarredEntriesBatch(dbPageSize, off);
    if (batch.length === 0) break;
    off += batch.length;
    for (const entry of batch) {
      expectedFilenames.add(getFavoritesExportFilename(entry));
    }
  }

  if (!deadline.isExpired()) {
    try {
      const files = await readdir(favoritesFolder);
      for (const name of files) {
        if (deadline.isExpired()) break;
        if (name.startsWith(".")) continue;
        if (!expectedFilenames.has(name)) {
          const full = join(favoritesFolder, name);
          try {
            await unlink(full);
            debugLogger(`Removed orphan from favorites: ${name}`);
          } catch (e) {
            debugLogger(`Could not remove ${full}:`, e);
          }
        }
      }
    } catch (e) {
      debugLogger("readdir favorites folder:", e);
    }
  }

  if (deadline.isExpired()) {
    debugLogger("Favorite export: time budget exhausted after cleanup");
    return;
  }

  const exportQueue = new Queue(exportConcurrency, { fifo: true });
  off = 0;
  while (!deadline.isExpired()) {
    const batch = await db.listStarredEntriesBatch(dbPageSize, off);
    if (batch.length === 0) break;
    off += batch.length;

    for (const entry of batch) {
      if (deadline.isExpired()) break;
      const targetPath = getFavoritesExportPath(entry);
      if (await fileExists(targetPath)) continue;
      exportQueue.add(async () => {
        if (deadline.isExpired()) return;
        try {
          await exportStarredEntry(entry);
        } catch (e) {
          debugLogger(`Export failed ${entry.album.name}/${entry.name}:`, e);
        }
      });
    }
  }

  await exportQueue.drain();

  if (deadline.isExpired()) {
    debugLogger("Favorite export: finished or stopped on time budget");
  }
}

function setupEventListeners(): void {
  debugLogger("Favorite-exporter batch sync uses entries DB; live star toggles still use main-process jobs.");
}

/**
 * Initialize favorite-exporter: set up event listeners.
 * Export logic runs only in the worker thread (reader/writer split).
 * Called from worker-manager.
 */
export function setupFavoriteExporter(_getWalkerReadyPromise: () => Promise<void>): void {
  setupEventListeners();
}
