import Debug from "debug";
import { parentPort } from "worker_threads";
import { Queue } from "../../../../shared/lib/queue";
import { events } from "../../../../shared/server-events";
import { ThumbnailSize } from "../../../../shared/types/types";
import { imageInfo } from "../../../imageOperations/info";
import { makeThumbnailIfNeeded } from "../../../rpc/rpcFunctions/thumbnail";
import { getEntriesDatabase } from "../../entries/internal/database";

const debug = Debug("app:bg-thumbgen");

const THUMBNAIL_QUEUE_CONCURRENCY = 4;
const STARTUP_SIZES = ["th-small", "th-medium"] as const;

const thumbnailQueue = new Queue(THUMBNAIL_QUEUE_CONCURRENCY, { fifo: true });

function enqueueThumbnail(
  entry: { album: { key: string; name: string }; name: string },
  size: ThumbnailSize,
): void {
  thumbnailQueue.add(async () => {
    try {
      await makeThumbnailIfNeeded(entry, size, true);
      await makeThumbnailIfNeeded(entry, size, false);
    } catch (error) {
      debug(`Error generating thumbnail for ${entry.album.name}/${entry.name} (${size}):`, error);
    }
  });
}

export async function buildThumbs() {
  const db = getEntriesDatabase();

  if (parentPort) {
    parentPort.postMessage({ type: "ready" });
  }

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

