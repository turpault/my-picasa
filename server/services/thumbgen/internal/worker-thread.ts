import Debug from "debug";
import { addJob } from "../../../utils/global-job-queue";
import { events } from "../../../../shared/server-events";
import { ThumbnailSize } from "../../../../shared/types/types";
import { imageInfo } from "../../../imageOperations/info";
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
  debug("Setting up event-driven thumbnail generation");

  events.on("albumEntryAdded", async (entry) => {
    try {
      await imageInfo(entry);
      for (const size of STARTUP_SIZES) {
        enqueueThumbnail(entry, size);
      }
    } catch (error) {
      debug(`Error queueing thumbnails for ${entry.name}:`, error);
    }
  });

  events.on("albumEntryFileChanged", async (entry) => {
    try {
      await imageInfo(entry);
      for (const size of STARTUP_SIZES) {
        enqueueThumbnail(entry, size);
      }
    } catch (error) {
      debug(`Error queueing thumbnails for changed ${entry.name}:`, error);
    }
  });

  events.on("filtersChanged", (event: { entry: { album: { key: string; name: string }; name: string } }) => {
    for (const size of STARTUP_SIZES) {
      enqueueThumbnail(event.entry, size);
    }
  });

  events.on("rotateChanged", (event: { entry: { album: { key: string; name: string }; name: string } }) => {
    for (const size of STARTUP_SIZES) {
      enqueueThumbnail(event.entry, size);
    }
  });

  debug("Event-driven thumbnail generation set up successfully");
}

