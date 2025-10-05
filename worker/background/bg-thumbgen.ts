import Debug from "debug";
import { AlbumEntry, ThumbnailSizeVals } from "../../shared/types/types";
import { imageInfo } from "../../server/imageOperations/info";
import { media } from "../../server/rpc/rpcFunctions/albumUtils";
import { makeThumbnailIfNeeded } from "../../server/rpc/rpcFunctions/thumbnail";
import { folders, waitUntilWalk, fileFoundEventEmitter } from "../../server/walker";
const debug = Debug("app:bg-thumbgen");

// Cache thumbnail sizes to avoid recalculating
const thumbnailSizes = ThumbnailSizeVals.filter((f) => !f.includes("large"))
  .map((size) => [
    { size, animated: true },
    { size, animated: false },
  ])
  .flat();

export async function buildThumbs() {
  // Set up event-driven thumbnail generation instead of batch processing
  setupEventDrivenThumbnailGeneration();
  
  // For backward compatibility, still wait for walk to complete
  // but thumbnails will be generated as files are found
  await waitUntilWalk();
  debug("Thumbnail generation setup complete");
}

/**
 * Set up event-driven thumbnail generation that processes files as they are found
 */
function setupEventDrivenThumbnailGeneration(): void {
  debug("Setting up event-driven thumbnail generation");

  // Listen for files found during walk
  fileFoundEventEmitter.on("fileFound", async (event) => {
    try {
      debug(`Generating thumbnails for ${event.entries.length} files from album ${event.album.name}`);
      
      // Process each entry individually
      for (const picture of event.entries) {
        try {
          await imageInfo(picture);
          await Promise.all(
            thumbnailSizes.map(({ size, animated }) =>
              makeThumbnailIfNeeded(picture, size, animated),
            ),
          );
        } catch (error) {
          debug(`Error generating thumbnails for ${picture.name}:`, error);
        }
      }
    } catch (error) {
      debug("Error processing file found event for thumbnails:", error);
    }
  });

  debug("Event-driven thumbnail generation set up successfully");
}
