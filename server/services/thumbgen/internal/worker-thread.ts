import Debug from "debug";

const debug = Debug("app:bg-thumbgen");

/**
 * Thumbnail jobs are now scheduled by post-walk (scheduleJobsForEntries) and
 * mutations (scheduleThumbnailJob). No startup or event-driven enqueue here.
 */
export async function buildThumbs() {
  debug("Thumbnail generation: jobs scheduled by walker post-walk and mutations");
}

