/**
 * Job scheduling for walk and reindex phases.
 * Jobs are added only during:
 * 1. Post-walk scan (missing exif, thumbnails)
 * 2. Reindex (new/changed entries, removed entries)
 * 3. Mutations (filter/rotation changes → thumbnail; favorites sync is periodic favorite-exporter worker only)
 *
 * No jobs are added from events.
 */
import debug from "debug";
import { addJob } from "../../../utils/main-process-job-queue";
import {
  AlbumEntry,
  AlbumEntryMetaData,
  ThumbnailSize,
} from "../../../../shared/types/types";
import { isPicture, isVideo } from "../../../../shared/lib/utils";
import { makeThumbnailIfNeeded } from "../../../rpc/rpcFunctions/thumbnail";
import { runRemoveJob, runUpdateEntryJob } from "../../extraction/internal/operations";
import { getWalkerDatabase } from "./database";

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

/**
 * After a full library walk: enqueue thumbnails only when album_entries says they are stale
 * (thumb_filter_version_* behind filter_version or still -1). Avoids stat()-scanning every file on
 * every startup; missing cache files on disk are still rebuilt on demand via readOrMakeThumbnail.
 */
export async function schedulePostWalkThumbnailJobsFromDb(): Promise<void> {
  const db = getWalkerDatabase();
  const rows = await db.getEntriesNeedingThumbnails([...STARTUP_THUMB_SIZES]);
  debugLogger("Post-walk thumbnail queue: %d (entry,size) pairs from DB", rows.length);
  for (const r of rows) {
    const entry: AlbumEntry = { album: r.album, name: r.entry_name };
    if (!isMediaEntry(entry)) continue;
    scheduleThumbnailJob(entry, [r.size]);
  }
}

/**
 * Reindex / file watcher: enqueue thumbnail jobs for touched entries.
 * makeThumbnailIfNeeded skips work when cache + DB versions are already current.
 */
export async function scheduleJobsForEntries(entries: AlbumEntry[]): Promise<void> {
  for (const entry of entries) {
    if (!isMediaEntry(entry)) continue;
    scheduleThumbnailJob(entry);
  }
}
