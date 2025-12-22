import Debug from "debug";
import { AlbumEntry, ThumbnailSizeVals } from "../../shared/types/types";
import { imageInfo } from "../../imageOperations/info";
import { makeThumbnailIfNeeded } from "../../rpc/rpcFunctions/thumbnail";
import { serverEvents } from "./events";
import { getAlbumEntries, getAllFolders, indexingReady } from "../indexing/worker";
const debug = Debug("app:bg-thumbgen");

// Cache thumbnail sizes to avoid recalculating
const thumbnailSizes = ThumbnailSizeVals.filter((f) => !f.includes("large"))
  .map((size) => [
    { size, animated: true },
    { size, animated: false },
  ])
  .flat();

export async function buildThumbs() {
  await indexingReady();
  const albums = getAllFolders();
  // Sort albums in reverse order (most recent first)
  albums.sort((a, b) => b.name.localeCompare(a.name));
  for (const album of albums) {
    const entries = await getAlbumEntries(album);
    for (const entry of entries) {
      await Promise.all(
        thumbnailSizes.map(({ size, animated }) =>
          makeThumbnailIfNeeded(entry, size, animated),
        ),
      );
    }
  }
  // Set up event-driven thumbnail generation instead of batch processing
  setupEventDrivenThumbnailGeneration();
  debug("Thumbnail generation setup complete");
}

/**
 * Set up event-driven thumbnail generation that processes files as they are found
 */
function setupEventDrivenThumbnailGeneration(): void {
  debug("Setting up event-driven thumbnail generation");

  // Listen for files found during walk
  serverEvents.on("fileFound", async (entry) => {
    try {
      await imageInfo(entry);
      await Promise.all(
        thumbnailSizes.map(({ size, animated }) =>
          makeThumbnailIfNeeded(entry, size, animated),
        ),
      );
    } catch (error) {
      debug(`Error generating thumbnails for ${entry.name}:`, error);
    }
  });

  debug("Event-driven thumbnail generation set up successfully");
}
