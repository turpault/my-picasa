/**
 * Global job schedulers - no longer event-driven.
 * Jobs are added only during:
 * 1. Post-walk scan (walker/internal/post-walk-jobs.ts)
 * 2. Reindex (file watcher triggers reindex, post-walk-jobs schedules)
 * 3. Mutations (setFilters, setRotate, toggleStar call scheduleThumbnailJob/scheduleFavoriteExportJob)
 */
import debug from "debug";

const debugLogger = debug("app:job-schedulers");

export function setupGlobalJobSchedulers(): void {
  debugLogger("Global job schedulers: event-driven scheduling disabled (jobs from walk/reindex/mutations only)");
}
