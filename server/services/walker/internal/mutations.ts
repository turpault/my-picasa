import { isMainThread } from "worker_threads";
import { Album, AlbumEntry, AlbumEntryMetaData, AlbumEntryPicasa, AlbumEntryWithMetadata } from "../../../../shared/types/types";
import { getWalkerDatabase } from "./database";
import * as picasaIni from "./picasa-ini";
import { events } from "../../../../shared/server-events";
import { imageInfo } from "../../../imageOperations/info";

/**
 * Walker Service Mutations
 *
 * These functions perform write operations that update both the database and picasa-ini files.
 * These functions are ONLY called from walker-worker-rpc.ts (RPC handler in worker thread).
 * In the worker thread, they perform the actual operations directly on the database and picasa-ini.
 *
 * IMPORTANT: These functions should NOT be called directly from outside the RPC handler.
 * Use getMutations() from queries.ts to get the RPC client for mutation operations.
 */

/**
 * Update an album entry in picasa-ini, the entry database, and trigger downstream jobs.
 * This is the single entry point for entry metadata updates - it updates both stores
 * and emits events that trigger thumbnails, search indexing, etc. via the global queue.
 *
 * @param options.incrementFilterVersion - When true, bumps filter_version so thumbnails are invalidated
 */
export async function updateAlbumEntry(
  entry: AlbumEntry,
  field: keyof AlbumEntryMetaData | "*",
  value: any,
  options?: { incrementFilterVersion?: boolean }
): Promise<void> {
  const db = getWalkerDatabase();

  // 1. Write to picasa-ini (source of truth for user edits)
  await picasaIni.writeEntryToPicasaIni(entry, field, value);

  // 2. Update entry database (derived cache)
  const currentMetadata = await db.getEntryMetadata(entry);
  let updatedMetadata: AlbumEntryMetaData;
  if (field === "*") {
    updatedMetadata = value || {};
  } else if (value !== undefined && value !== null) {
    updatedMetadata = { ...currentMetadata, [field]: `${value}` };
  } else {
    const m = { ...currentMetadata } as Record<string, unknown>;
    delete m[field as string];
    updatedMetadata = m as AlbumEntryMetaData;
  }
  await db.updateEntryMetadata(entry, updatedMetadata, options);

  // 3. Emit events to trigger downstream jobs (thumbnails, search, etc.)
  if (field !== "*") {
    const finalMetadata = await db.getEntryMetadata(entry);
    const entryPicasa: AlbumEntryPicasa = { ...entry, metadata: finalMetadata };

    if (["filters", "caption", "rotate", "star", "starCount"].includes(field as string)) {
      events.emit("albumEntryAspectChanged", entryPicasa);
    }
    events.emit("picasaEntryUpdated", { entry: entryPicasa, field: field as string, value });
    try {
      const entryWithImageInfo = await imageInfo(entry, finalMetadata);
      events.emit("albumEntryUpdated", entryWithImageInfo);
    } catch {
      // Ignore imageInfo errors, still emit the update event
    }
  }
}

/**
 * Update entry metadata in both database and picasa-ini
 * Can update all metadata or a specific field
 *
 * Usage:
 * - updateEntryMetadata(entry, metadata) - update all metadata
 * - updateEntryMetadata(entry, field, value) - update specific field
 */
export async function updateEntryMetadata(
  entry: AlbumEntry,
  fieldOrMetadata: keyof AlbumEntryMetaData | "*" | AlbumEntryMetaData,
  value?: any
): Promise<void> {
  const db = getWalkerDatabase();

  let updatedMetadata: AlbumEntryMetaData;
  let field: keyof AlbumEntryMetaData | "*";

  if (value === undefined && typeof fieldOrMetadata === "object" && fieldOrMetadata !== null) {
    updatedMetadata = fieldOrMetadata as AlbumEntryMetaData;
    field = "*";
  } else {
    field = fieldOrMetadata as keyof AlbumEntryMetaData | "*";
    const currentMetadata = await db.getEntryMetadata(entry);

    if (field === "*") {
      updatedMetadata = value || {};
    } else {
      updatedMetadata = { ...currentMetadata };
      if (value !== undefined && value !== null) {
        (updatedMetadata as Record<string, unknown>)[field as string] = `${value}`;
      } else {
        delete (updatedMetadata as Record<string, unknown>)[field as string];
      }
    }
  }

  const incrementFilterVersion = field === "filters" || field === "rotate";
  await updateAlbumEntry(entry, field, value, { incrementFilterVersion });
}

/**
 * Set caption for an entry
 */
export async function setCaption(entry: AlbumEntry, caption: string): Promise<void> {
  await updateAlbumEntry(entry, "caption", caption);
  const metadata = (await picasaIni.getPicasaEntry(entry)) as AlbumEntryMetaData;
  events.emit("captionChanged", { entry: { ...entry, metadata } as AlbumEntryPicasa });
}

/**
 * Set filters for an entry
 */
export async function setFilters(entry: AlbumEntry, filters: string): Promise<void> {
  await updateAlbumEntry(entry, "filters", filters, { incrementFilterVersion: true });
  const metadata = (await picasaIni.getPicasaEntry(entry)) as AlbumEntryMetaData;
  events.emit("filtersChanged", { entry: { ...entry, metadata } as AlbumEntryPicasa });
}

/**
 * Set rotate for an entry
 */
export async function setRotate(entry: AlbumEntry, rotate?: string): Promise<void> {
  await updateAlbumEntry(entry, "rotate", rotate, { incrementFilterVersion: true });
  const metadata = (await picasaIni.getPicasaEntry(entry)) as AlbumEntryMetaData;
  events.emit("rotateChanged", { entry: { ...entry, metadata } as AlbumEntryPicasa });
}

/**
 * Toggle star for entries
 */
export async function toggleStar(entries: AlbumEntry[]): Promise<void> {
  const { MAX_STAR } = await import("../../../../shared/lib/shared-constants");
  for (const entry of entries) {
    const metadata = await picasaIni.getPicasaEntry(entry);
    let star = metadata.star;
    let starCount: string | undefined = metadata.starCount || "1";
    if (!star) {
      star = true;
      starCount = "1";
    } else {
      starCount = (parseInt(starCount) + 1).toString();
    }
    if (parseInt(starCount) >= MAX_STAR) {
      starCount = undefined;
      star = undefined;
    }
    await updateAlbumEntry(entry, "star", star);
    await updateAlbumEntry(entry, "starCount", starCount);
    const finalMetadata = await picasaIni.getPicasaEntry(entry);
    events.emit("favoriteChanged", {
      entry: { ...entry, metadata: finalMetadata } as AlbumEntryPicasa,
    });
  }
}

/**
 * Rotate entries
 */
export async function rotate(entries: AlbumEntry[], direction: string): Promise<void> {
  const { decodeRotate } = await import("../../../../shared/lib/utils");
  const increment = { left: 1, right: 3 }[direction] ?? 0;
  for (const entry of entries) {
    const picasa = await picasaIni.getPicasaEntry(entry);
    const rotateValue = decodeRotate(picasa.rotate);
    const targetValue = (increment + rotateValue) % 4;
    const rotateStr = targetValue === 0 ? undefined : `rotate(${targetValue})`;
    await updateAlbumEntry(entry, "rotate", rotateStr, { incrementFilterVersion: true });
  }
}

/**
 * Update album shortcut
 * Updates both database and picasa-ini files.
 */
export async function updateAlbumShortcut(album: Album, shortcut: string): Promise<void> {
  // This function is only called from the RPC handler in the worker thread
  // Update picasa-ini first (which handles shortcut uniqueness)
  await picasaIni.setPicasaAlbumShortcut(album, shortcut);

  // Then update database
  const db = getWalkerDatabase();
  await db.updateAlbumShortcut(album.key, shortcut || null);

  // Emit event after successful mutation
  events.emit("shortcutsUpdated", {});
}

/**
 * Touch picasa entry (ensure it exists in picasa-ini)
 */
export async function touchPicasaEntry(entry: AlbumEntry): Promise<void> {
  // This function is only called from the RPC handler in the worker thread
  await picasaIni.touchPicasaEntry(entry);
  // Also update database
  const db = getWalkerDatabase();
  const metadata = await picasaIni.getPicasaEntry(entry);
  await db.updateEntryMetadata(entry, metadata);
}
