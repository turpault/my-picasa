/**
 * File watcher using Bun's native fs.watch.
 * Detects image/video file add/update/delete and triggers album reindex.
 * Started after the walker completes its first scan.
 */

import debug from "debug";
import { watch } from "fs";
import { dirname } from "path";
import {
  Album,
  keyFromID,
  pictureExtensions,
  videoExtensions,
} from "../../../../shared/types/types";
import { imagesRoot } from "../../../utils/constants";
import { events } from "../../../../shared/server-events";

const debugLogger = debug("app:file-watcher");

const DEBOUNCE_MS = 500;
const MEDIA_EXTENSIONS = new Set([
  ...pictureExtensions.map((e) => `.${e.toLowerCase()}`),
  ...videoExtensions.map((e) => `.${e.toLowerCase()}`),
]);

function isMediaFile(filename: string): boolean {
  const lower = filename.toLowerCase();
  return [...MEDIA_EXTENSIONS].some((ext) => lower.endsWith(ext));
}

function shouldSkipPath(relativePath: string): boolean {
  const firstSegment = relativePath.split("/")[0];
  return firstSegment.startsWith(".");
}

export function startFileWatcher(): void {
  const pendingAlbums = new Set<string>();
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  function scheduleReindex(albumKey: string): void {
    pendingAlbums.add(albumKey);
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      const keys = [...pendingAlbums];
      pendingAlbums.clear();
      const albums: Album[] = keys.map((key) => ({
        key,
        name: key.split("»").pop() ?? key,
      }));
      if (albums.length > 0) {
        debugLogger(`Reindexing ${albums.length} album(s) after filesystem change`);
        events.emit("reindex", albums);
      }
    }, DEBOUNCE_MS);
  }

  const watcher = watch(
    imagesRoot,
    { recursive: true },
    (eventType, filename) => {
      if (!filename) return;
      const relativePath = filename.replace(/\\/g, "/");
      if (shouldSkipPath(relativePath)) return;
      if (!isMediaFile(relativePath)) return;

      const dir = dirname(relativePath);
      const albumKey = dir === "." ? keyFromID("") : keyFromID(dir);
      scheduleReindex(albumKey);
    }
  );

  debugLogger(`Watching ${imagesRoot} for image/video changes`);
}
