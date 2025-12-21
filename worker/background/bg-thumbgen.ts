import Debug from "debug";
import { AlbumEntry, ThumbnailSizeVals } from "../../shared/types/types";
import { imageInfo } from "../../server/imageOperations/info";
import { media } from "../../server/rpc/rpcFunctions/albumUtils";
import { makeThumbnailIfNeeded } from "../../server/rpc/rpcFunctions/thumbnail";
import { folders, waitUntilWalk, fileFoundEventEmitter, getFolderAlbums } from "../../server/walker";
const debug = Debug("app:bg-thumbgen");

// Cache thumbnail sizes to avoid recalculating
const thumbnailSizes = ThumbnailSizeVals.filter((f) => !f.includes("large"))
  .map((size) => [
    { size, animated: true },
    { size, animated: false },
  ])
  .flat();

export async function buildThumbs() {
  // For backward compatibility, still wait for walk to complete
  // but thumbnails will be generated as files are found
  await waitUntilWalk();
  const albums = await getFolderAlbums();
  // Sort albums in reverse order (most recent first)
  albums.sort((a, b) => b.name.localeCompare(a.name));
  for (const album of albums) {
    const m = await media(album);
    for (const entry of m.entries) {
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
  fileFoundEventEmitter.on("fileFound", async (entry) => {
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
