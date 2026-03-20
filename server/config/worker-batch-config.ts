import { env } from "process";

const THREE_HOURS_MS = 3 * 60 * 60 * 1000;

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw === "") return fallback;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function parsePositiveMs(raw: string | undefined, fallbackMs: number): number {
  if (raw === undefined || raw === "") return fallbackMs;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallbackMs;
}

/** Max wall time for one faces worker run (default 3h). */
export function getFacesRunMaxMs(): number {
  return parsePositiveMs(env.PICISA_FACES_RUN_MAX_MS, THREE_HOURS_MS);
}

/** Global job queue concurrency inside the faces process (default 5). */
export function getFacesQueueConcurrency(): number {
  return parsePositiveInt(env.PICISA_FACES_QUEUE_CONCURRENCY, 5);
}

/**
 * Entries DB page size = concurrency × multiplier (default 5 × 20 = 100).
 * Larger batches reduce query round-trips; work still runs at queue concurrency.
 */
export function getFacesEntriesBatchSize(concurrency: number): number {
  const mult = parsePositiveInt(env.PICISA_FACES_BATCH_MULTIPLIER, 20);
  return concurrency * mult;
}

/** Max wall time for one favorite-exporter worker run (default 3h). */
export function getFavoritesRunMaxMs(): number {
  return parsePositiveMs(env.PICISA_FAVORITES_RUN_MAX_MS, THREE_HOURS_MS);
}

/** Concurrent export operations in the favorite-exporter worker (default 3). */
export function getFavoritesExportConcurrency(): number {
  return parsePositiveInt(env.PICISA_FAVORITES_EXPORT_CONCURRENCY, 3);
}

/** Page size when scanning starred entries from the entries DB (default 2000). */
export function getFavoritesDbPageSize(): number {
  return parsePositiveInt(env.PICISA_FAVORITES_DB_PAGE_SIZE, 2000);
}
