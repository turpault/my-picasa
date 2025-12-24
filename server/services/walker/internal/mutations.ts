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
  // This function is only called from the RPC handler in the worker thread
  const db = getWalkerDatabase();

  // Handle two call patterns:
  // 1. updateEntryMetadata(entry, metadata) - update all metadata
  // 2. updateEntryMetadata(entry, field, value) - update specific field
  let updatedMetadata: AlbumEntryMetaData;
  let field: keyof AlbumEntryMetaData | "*";

  if (value === undefined && typeof fieldOrMetadata === "object" && fieldOrMetadata !== null) {
    // Pattern 1: updateEntryMetadata(entry, metadata)
    updatedMetadata = fieldOrMetadata as AlbumEntryMetaData;
    field = "*";
  } else {
    // Pattern 2: updateEntryMetadata(entry, field, value)
    field = fieldOrMetadata as keyof AlbumEntryMetaData | "*";
    const currentMetadata = db.getEntryMetadata(entry);

    if (field === "*") {
      updatedMetadata = value || {};
    } else {
      updatedMetadata = { ...currentMetadata };
      if (value !== undefined && value !== null) {
        (updatedMetadata as any)[field] = `${value}`;
      } else {
        delete (updatedMetadata as any)[field];
      }
    }
  }

  // Update database
  const dbPromise = new Promise<void>((resolve, reject) => {
    try {
      db.updateEntryMetadata(entry, updatedMetadata);
      resolve();
    } catch (error) {
      reject(error);
    }
  });

  // Update picasa-ini
  const picasaPromise = picasaIni.updatePicasaEntry(entry, field, value);

  // Wait for both to complete
  await Promise.all([dbPromise, picasaPromise]);

  // Emit events after successful mutation
  if (field !== "*") {
    const finalMetadata = db.getEntryMetadata(entry);

    const fieldStr = field as string;
    const entryPicasa: AlbumEntryPicasa = {
      ...entry,
      metadata: finalMetadata,
    };

    // Emit specific event based on field type
    if (["filters", "caption", "rotate", "star", "starCount"].includes(fieldStr)) {
      events.emit("albumEntryAspectChanged", entryPicasa);
    }

    // Emit general picasa entry update event
    events.emit("picasaEntryUpdated", {
      entry: entryPicasa,
      field: fieldStr,
      value: value,
    });

    // Emit album entry updated event with image info
    try {
      const entryWithImageInfo = await imageInfo(entry, finalMetadata);
      events.emit("albumEntryUpdated", entryWithImageInfo);
    } catch (error) {
      // Ignore imageInfo errors, still emit the update event
    }
  }
}

/**
 * Set caption for an entry
 */
export async function setCaption(entry: AlbumEntry, caption: string): Promise<void> {
  // This function is only called from the RPC handler in the worker thread
  await updateEntryMetadata(entry, 'caption', caption);
  await picasaIni.setCaption(entry, caption);

  // Emit event after successful mutation
  const metadata = await picasaIni.getPicasaEntry(entry);
  events.emit("captionChanged", {
    entry: { ...entry, metadata } as AlbumEntryPicasa,
  });
}

/**
 * Set filters for an entry
 */
export async function setFilters(entry: AlbumEntry, filters: string): Promise<void> {
  // This function is only called from the RPC handler in the worker thread
  await updateEntryMetadata(entry, 'filters', filters);
  await picasaIni.setFilters(entry, filters);

  // Emit event after successful mutation
  const metadata = await picasaIni.getPicasaEntry(entry);
  events.emit("filtersChanged", {
    entry: { ...entry, metadata } as AlbumEntryPicasa,
  });
}

/**
 * Set rotate for an entry
 */
export async function setRotate(entry: AlbumEntry, rotate?: string): Promise<void> {
  // This function is only called from the RPC handler in the worker thread
  await updateEntryMetadata(entry, 'rotate', rotate);
  await picasaIni.setRotate(entry, rotate);

  // Emit event after successful mutation
  const metadata = await picasaIni.getPicasaEntry(entry);
  events.emit("rotateChanged", {
    entry: { ...entry, metadata } as AlbumEntryPicasa,
  });
}

/**
 * Toggle star for entries
 */
export async function toggleStar(entries: AlbumEntry[]): Promise<void> {
  // This function is only called from the RPC handler in the worker thread
  await picasaIni.toggleStar(entries);
  // Also update database for each entry
  const db = getWalkerDatabase();
  for (const entry of entries) {
    const metadata = await picasaIni.getPicasaEntry(entry);
    db.updateEntryMetadata(entry, metadata);

    // Emit event after successful mutation
    events.emit("favoriteChanged", {
      entry: { ...entry, metadata } as AlbumEntryPicasa,
    });
  }
}

/**
 * Rotate entries
 */
export async function rotate(entries: AlbumEntry[], direction: string): Promise<void> {
  // This function is only called from the RPC handler in the worker thread
  await picasaIni.rotate(entries, direction);
  // Also update database for each entry
  const db = getWalkerDatabase();
  for (const entry of entries) {
    const metadata = await picasaIni.getPicasaEntry(entry);
    db.updateEntryMetadata(entry, metadata);
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
  db.updateAlbumShortcut(album.key, shortcut || null);

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
  db.updateEntryMetadata(entry, metadata);
}
