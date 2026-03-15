/**
 * Event-driven job schedulers for the global queue.
 * Each job type listens to relevant events and schedules work with debouncing
 * to avoid pushing the same job twice.
 */
import debug from "debug";
import { addJob } from "./global-job-queue";
import { events } from "../../shared/server-events";
import { imageInfo } from "../imageOperations/info";
import { makeThumbnailIfNeeded } from "../rpc/rpcFunctions/thumbnail";
import { getEntryMetadata } from "../walker/queries";
import { unlink } from "fs/promises";
import { extname, join } from "path";
import { exportToFolder } from "../imageOperations/export";
import { waitUntilIdle } from "./busy";
import { favoritesFolder } from "./constants";
import { fileExists } from "./serverUtils";
import { AlbumEntry, ThumbnailSize } from "../../shared/types/types";
import { isVideo, namifyAlbumEntry } from "../../shared/lib/utils";
import { RESIZE_ON_EXPORT_SIZE } from "../../shared/lib/shared-constants";
import type { JobType } from "../services/extraction/job-types";
import { extractExifData } from "../services/exif/internal/worker-thread";
import { createReferenceFileIfNeeded } from "../services/faces/internal/face/references";

const debugLogger = debug("app:job-schedulers");

const DEBOUNCE_MS = 300;
const STARTUP_THUMB_SIZES = ["th-small", "th-medium"] as const;

function entryKey(entry: { album: { key: string }; name: string }): string {
  return `${entry.album.key}:${entry.name}`;
}

/** Debounce map: key -> { timeout, payload }. Resets timer on each call. */
const pendingJobs = new Map<
  string,
  { timeout: ReturnType<typeof setTimeout>; schedule: () => void }
>();

function debounceSchedule(
  key: string,
  schedule: () => void,
  delayMs: number = DEBOUNCE_MS
): void {
  const existing = pendingJobs.get(key);
  if (existing) {
    clearTimeout(existing.timeout);
  }
  const timeout = setTimeout(() => {
    pendingJobs.delete(key);
    schedule();
  }, delayMs);
  pendingJobs.set(key, { timeout, schedule });
}

function scheduleExif(entry: AlbumEntry): void {
  debounceSchedule(`exif:${entryKey(entry)}`, () => {
    addJob(
      async () => {
        await waitUntilIdle();
        await extractExifData(entry);
      },
      "EXIF"
    );
  });
}

function scheduleThumbnail(
  entry: { album: { key: string; name: string }; name: string },
  sizes: readonly ThumbnailSize[] = STARTUP_THUMB_SIZES
): void {
  for (const size of sizes) {
    const key = `thumbnail:${entryKey(entry)}:${size}`;
    debounceSchedule(key, () => {
      addJob(
        async () => {
          try {
            await makeThumbnailIfNeeded(entry, size, true);
            await makeThumbnailIfNeeded(entry, size, false);
          } catch (error) {
            debugLogger(`Error generating thumbnail for ${entry.album.name}/${entry.name} (${size}):`, error);
          }
        },
        "THUMBNAIL"
      );
    });
  }
}

function scheduleFace(entry: AlbumEntry): void {
  debounceSchedule(`face:${entryKey(entry)}`, () => {
    addJob(async () => createReferenceFileIfNeeded(entry), "FACE");
  });
}

type FavoriteExportAction = "export" | "remove";

/** Store latest action per entry so rapid star toggle coalesces correctly. */
const pendingFavoriteActions = new Map<string, { entry: AlbumEntry; action: FavoriteExportAction }>();

function scheduleFavoriteExport(entry: AlbumEntry, action: FavoriteExportAction): void {
  const key = `favorite_export:${entryKey(entry)}`;
  pendingFavoriteActions.set(key, { entry, action });
  debounceSchedule(key, () => {
    const pending = pendingFavoriteActions.get(key);
    pendingFavoriteActions.delete(key);
    if (!pending) return;
    const { entry: e, action: a } = pending;
    addJob(
      async () => {
        await waitUntilIdle();
        if (a === "export") {
          await exportToFolder(e, favoritesFolder, {
            label: true,
            resize: RESIZE_ON_EXPORT_SIZE,
          });
        } else {
          const targetPath = join(
            favoritesFolder,
            namifyAlbumEntry(e) + (isVideo(e) ? extname(e.name) : ".jpg")
          );
          if (await fileExists(targetPath)) {
            await unlink(targetPath);
            debugLogger(`Removed from favorites: ${e.name}`);
          }
        }
      },
      "FAVORITE_EXPORT" as JobType
    );
  });
}

export function setupGlobalJobSchedulers(): void {
  debugLogger("Setting up global job schedulers");

  // --- EXIF: file updates (binary or stats) ---
  events.on("albumEntryAdded", (entry: AlbumEntry) => {
    scheduleExif(entry);
  });
  events.on("albumEntryFileChanged", (entry: AlbumEntry) => {
    scheduleExif(entry);
  });

  // --- THUMBNAIL: entry filter + file updates ---
  events.on("albumEntryAdded", async (entry: AlbumEntry) => {
    try {
      await imageInfo(entry);
      scheduleThumbnail(entry);
    } catch (error) {
      debugLogger(`Error queueing thumbnails for ${entry.name}:`, error);
    }
  });
  events.on("albumEntryFileChanged", async (entry: AlbumEntry) => {
    try {
      await imageInfo(entry);
      scheduleThumbnail(entry);
    } catch (error) {
      debugLogger(`Error queueing thumbnails for changed ${entry.name}:`, error);
    }
  });
  events.on("filtersChanged", (event: { entry: AlbumEntry }) => {
    scheduleThumbnail(event.entry);
  });
  events.on("rotateChanged", (event: { entry: AlbumEntry }) => {
    scheduleThumbnail(event.entry);
  });

  // --- FACE: file updates ---
  events.on("albumEntryAdded", (entry: AlbumEntry) => {
    scheduleFace(entry);
  });
  events.on("albumEntryFileChanged", (entry: AlbumEntry) => {
    scheduleFace(entry);
  });

  // --- FAVORITE_EXPORT: entry updates (star changes) ---
  events.on("albumEntryAdded", (entry: AlbumEntry) => {
    const metadata = getEntryMetadata(entry);
    if (!metadata.star) return;
    scheduleFavoriteExport(entry, "export");
  });
  events.on("picasaEntryUpdated", (event: { entry: AlbumEntry; field: string; value: unknown }) => {
    if (event.field !== "star") return;
    const entry = event.entry;
    scheduleFavoriteExport(entry, event.value ? "export" : "remove");
  });

  debugLogger("Global job schedulers set up");
}
