import { isMainThread, parentPort } from "worker_threads";
import { buildEmitter } from "../../shared/lib/event";
import { Album, AlbumEntry, AlbumEntryPicasa, AlbumEntryWithMetadata, AlbumWithData } from "../../shared/types/types";

type ServerEvents = {
  favoriteChanged: {
    entry: AlbumEntryPicasa;
  };
  filtersChanged: {
    entry: AlbumEntryPicasa;
  };
  rotateChanged: {
    entry: AlbumEntryPicasa;
  };
  captionChanged: {
    entry: AlbumEntryPicasa;
  };
  picasaEntryUpdated: {
    entry: AlbumEntryPicasa;
    field: string;
    value: any;
  };
  albumEntryAdded: AlbumEntry;
  albumEntryRemoved: AlbumEntry;
  albumEntryUpdated: AlbumEntryWithMetadata;
  albumAdded: AlbumWithData;
  albumRemoved: Album;
  albumUpdated: AlbumWithData;
  reindex: Album[];
  exifDataProcessed: AlbumEntry;
  geoDataFound: AlbumEntry;
};

export const events = buildEmitter<ServerEvents>();

// Store original emit for use in worker-manager
(events as any).__originalEmit = events.emit;

// Override emit to forward events from worker threads to main thread
const originalEmit = events.emit;
events.emit = (type: any, event?: any) => {
  if (!isMainThread && parentPort) {
    // In worker thread: send message to main thread (don't emit locally, wait for it to come back)
    parentPort.postMessage({
      type: "serverEvent",
      eventType: type,
      data: event,
    });
    // Return true to indicate event was "handled" (sent to main thread)
    return true;
  }
  // In main thread: emit directly
  return originalEmit.call(events, type, event);
};

// Receive events from main thread (if in worker)
if (!isMainThread && parentPort) {
  parentPort.on("message", (msg) => {
    if (msg.type === "serverEvent" && msg.eventType) {
      // Re-emit on local events object
      originalEmit(msg.eventType, msg.data);
    }
  });
}
