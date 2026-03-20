/**
 * Job scheduling for walk and reindex phases.
 * Jobs are added only during:
 * 1. Post-walk scan (missing exif, thumbnails)
 * 2. Reindex (new/changed entries, removed entries)
 * 3. Mutations (filter/rotation changes → thumbnail; star changes → favorite export)
 *
 * No jobs are added from events.
 */
import debug from "debug";
import { addJob } from "../../../utils/global-job-queue";
import { waitUntilIdle } from "../../../utils/busy";
import {
  AlbumEntry,
  AlbumEntryMetaData,
  ThumbnailSize,
} from "../../../../shared/types/types";
import { isPicture, isVideo } from "../../../../shared/lib/utils";
import { makeThumbnailIfNeeded } from "../../../rpc/rpcFunctions/thumbnail";
import { shouldMakeThumbnail } from "../../../rpc/rpcFunctions/thumbnail-cache";
import type { JobType } from "../../extraction/job-types";
import { unlink } from "fs/promises";
import { extname, join } from "path";
import { exportToFolder } from "../../../imageOperations/export";
import { favoritesFolder } from "../../../utils/constants";
import { fileExists } from "../../../utils/serverUtils";
import { namifyAlbumEntry } from "../../../../shared/lib/utils";
import { RESIZE_ON_EXPORT_SIZE } from "../../../../shared/lib/shared-constants";
import { runRemoveJob, runUpdateEntryJob } from "../../extraction/internal/operations";
import { getEntryMetadata } from "../queries";

const debugLogger = debug("app:post-walk-jobs");

const STARTUP_THUMB_SIZES: readonly ThumbnailSize[] = ["th-small", "th-medium"];

function isMediaEntry(entry: AlbumEntry): boolean {
  return isPicture(entry) || isVideo(entry);
}

/** Add thumbnail generation job for entry. */
export function scheduleThumbnailJob(
  entry: { album: { key: string; name: string }; name: string },
  sizes: readonly ThumbnailSize[] = STARTUP_THUMB_SIZES
): void {
  for (const size of sizes) {
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
  }
}

/** Add removal job - removes entry from exif, geo, search DBs. */
export function scheduleRemoveJob(entry: AlbumEntry): void {
  addJob(() => runRemoveJob(entry), "REMOVE");
}

/** Add search index update job (caption, persons, etc.). */
export function scheduleUpdateEntryJob(entry: AlbumEntry, metadata: AlbumEntryMetaData): void {
  addJob(() => runUpdateEntryJob(entry, metadata), "UPDATE_ENTRY");
}

/** Add favorite export job. */
export function scheduleFavoriteExportJob(entry: AlbumEntry, action: "export" | "remove"): void {
  addJob(
    async () => {
      await waitUntilIdle();
      if (action === "export") {
        await exportToFolder(entry, favoritesFolder, {
          label: true,
          resize: RESIZE_ON_EXPORT_SIZE,
        });
      } else {
        const targetPath = join(
          favoritesFolder,
          namifyAlbumEntry(entry) + (isVideo(entry) ? extname(entry.name) : ".jpg")
        );
        if (await fileExists(targetPath)) {
          await unlink(targetPath);
          debugLogger(`Removed from favorites: ${entry.name}`);
        }
      }
    },
    "FAVORITE_EXPORT" as JobType
  );
}

/**
 * Scan entries and add jobs for missing thumbnails and favorite exports.
 * Called after walk and after reindex.
 */
export async function scheduleJobsForEntries(entries: AlbumEntry[]): Promise<void> {
  for (const entry of entries) {
    if (!isMediaEntry(entry)) continue;

    const needsAnimated = await shouldMakeThumbnail(entry, "th-small", true);
    const needsStatic = await shouldMakeThumbnail(entry, "th-small", false);
    if (needsAnimated || needsStatic) {
      scheduleThumbnailJob(entry);
    }

    // Face reference creation is handled by the faces worker (batch), not in main process

    const metadata = await getEntryMetadata(entry);
    if (metadata.star) {
      scheduleFavoriteExportJob(entry, "export");
    }
  }
}
