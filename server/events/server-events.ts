import { isMainThread, parentPort } from "worker_threads";
import { buildEmitter } from "../../shared/lib/event";
import { AlbumEntryPicasa } from "../../shared/types/types";
import { broadcast } from "../worker-manager";

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
};

export const events = buildEmitter<ServerEvents>();

// Bridge events to worker
const originalEmit = events.emit;
events.emit = (type: any, event?: any) => {
  if (isMainThread) {
    broadcast({
      type: "event",
      emitter: "events",
      eventType: type,
      data: event,
    });
  }
  return originalEmit(type, event);
};

// Receive events from main (if in worker)
if (!isMainThread && parentPort) {
  parentPort.on("message", (msg) => {
    if (msg.type === "event" && msg.emitter === "events") {
      originalEmit(msg.eventType, msg.data);
    }
  });
}
