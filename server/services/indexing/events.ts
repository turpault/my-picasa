import { isMainThread, parentPort } from "worker_threads";
import { buildEmitter } from "../../../shared/lib/event";
import { AlbumEntry, AlbumEntryWithMetadata, AlbumWithData } from "../../../shared/types/types";

// Proxy emitter for indexing service
export const serverEvents = buildEmitter<{
  fileFound: AlbumEntry;
  fileGone: AlbumEntry;
  albumFound: AlbumWithData;
  albumEntryChanged: AlbumEntryWithMetadata;
}>();

// Subscribe to ServerEvents
if (!isMainThread && parentPort) {
  // Listen for events from main thread
  parentPort.on("message", (msg) => {
    if (msg.type === "event" && msg.emitter === "events") {
      const { eventType, data } = msg;
      if (eventType === "fileFound" || eventType === "fileGone" || eventType === "albumFound" || eventType === "albumEntryChanged") {
        serverEvents.emit(eventType, data);
      }
    }
  });
} else if (isMainThread) {
  // In main thread, subscribe directly to ServerEvents
  const { events } = require("../../server/events/server-events");
  events.on("fileFound", (entry: AlbumEntry) => {
    serverEvents.emit("fileFound", entry);
  });
  events.on("fileGone", (entry: AlbumEntry) => {
    serverEvents.emit("fileGone", entry);
  });
  events.on("albumFound", (album: AlbumWithData) => {
    serverEvents.emit("albumFound", album);
  });
  events.on("albumEntryChanged", (entry: AlbumEntryWithMetadata) => {
    serverEvents.emit("albumEntryChanged", entry);
  });
}

