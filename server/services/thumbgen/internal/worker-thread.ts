import Debug from "debug";
import { addJob } from "../../../utils/global-job-queue";
import { ThumbnailSize } from "../../../../shared/types/types";
import { makeThumbnailIfNeeded } from "../../../rpc/rpcFunctions/thumbnail";
import { getEntriesDatabase } from "../../entries/internal/database";

const debug = Debug("app:bg-thumbgen");

const STARTUP_SIZES = ["th-small", "th-medium"] as const;

function enqueueThumbnail(
  entry: { album: { key: string; name: string }; name: string },
  size: ThumbnailSize,
): void {
  addJob(async () => {
    try {
      await makeThumbnailIfNeeded(entry, size, true);
      await makeThumbnailIfNeeded(entry, size, false);
    } catch (error) {
      debug(`Error generating thumbnail for ${entry.album.name}/${entry.name} (${size}):`, error);
    }
  }, "THUMBNAIL");
}

export async function buildThumbs() {
  const db = getEntriesDatabase();

  const needingThumbnails = db.getEntriesNeedingThumbnails([...STARTUP_SIZES]);
  for (const { album, entry_name, size } of needingThumbnails) {
    enqueueThumbnail({ album, name: entry_name }, size);
  }
  debug(`Queued ${needingThumbnails.length} thumbnail tasks for startup`);

  setupEventDrivenThumbnailGeneration();
  debug("Thumbnail generation setup complete");
}

function setupEventDrivenThumbnailGeneration(): void {
  // Thumbnail scheduling is handled by global-job-schedulers (albumEntryAdded,
  // albumEntryFileChanged, filtersChanged, rotateChanged)
  debug("Event-driven thumbnail generation delegated to global-job-schedulers");
}

