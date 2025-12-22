import { isMainThread, parentPort } from "worker_threads";
import { buildEmitter } from "../../../shared/lib/event";
import { AlbumEntry } from "../../../shared/types/types";

// Proxy emitter for thumbgen service
export const serverEvents = buildEmitter<{
  fileFound: AlbumEntry;
}>();

// Subscribe to ServerEvents
if (!isMainThread && parentPort) {
  // Listen for events from main thread
  parentPort.on("message", (msg) => {
    if (msg.type === "event" && msg.emitter === "events") {
      const { eventType, data } = msg;
      if (eventType === "fileFound") {
        serverEvents.emit("fileFound", data);
      }
    }
  });
} else if (isMainThread) {
  // In main thread, subscribe directly to ServerEvents
  const { events } = require("../../server/events/server-events");
  events.on("fileFound", (entry: AlbumEntry) => {
    serverEvents.emit("fileFound", entry);
  });
}

