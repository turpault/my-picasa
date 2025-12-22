import { Stats } from "fs";
import { stat } from "fs/promises";
import { join, relative } from "path";
import { isMainThread, parentPort, workerData } from "worker_threads";
import { startWorkers, broadcast, getAllWorkers } from "./worker-manager";
import { buildEmitter } from "../shared/lib/event";
import { Queue } from "../shared/lib/queue";
import {
  alphaSorter,
  buildReadySemaphore,
  differs,
  setReady,
  sleep,
} from "../shared/lib/utils";
import {
  Album,
  AlbumChangeEvent,
  AlbumEntry,
  AlbumEntryWithMetadata,
  AlbumKind,
  AlbumWithData,
  Filters,
  keyFromID,
} from "../shared/types/types";
import {
  assetsInFolderAlbum,
  queueNotification,
} from "./rpc/albumTypes/fileAndFolders";
import { mediaCount } from "./rpc/rpcFunctions/albumUtils";
import {
  getShortcuts,
  readShortcut,
} from "./rpc/rpcFunctions/picasa-ini";
import { imagesRoot, specialFolders } from "./utils/constants";
import { pathForAlbum } from "./utils/serverUtils";
import { queryFoldersByFilters } from "../worker/background/indexing";
import { events } from "./events/server-events";
import { serverEvents } from "../worker/background/indexing/events";

const readyLabelKey = "fileWalker";
const ready = buildReadySemaphore(readyLabelKey);
let lastWalk: AlbumWithData[] = [];
const walkQueue = new Queue(10);

export type FileFoundEvent = {
  fileFound: AlbumEntry;
  fileGone: AlbumEntry;
};

export type AlbumFoundEvent = {
  albumFound: AlbumWithData;
};

export type ListedMediaEvent = {
  assetsInFolderAlbum: { album: Album; entries: AlbumEntry[] };
};
export type AlbumEntryChangedEvent = {
  albumEntryChanged: AlbumEntryWithMetadata;
};

export const albumEventEmitter = buildEmitter<AlbumChangeEvent>();
export const fileFoundEventEmitter = buildEmitter<FileFoundEvent>();
export const albumFoundEventEmitter = buildEmitter<AlbumFoundEvent>();
export const listedMediaEventEmitter = buildEmitter<ListedMediaEvent>();
export const albumEntryEventEmitter = buildEmitter<AlbumEntryChangedEvent>();

export function initializeWorkers() {
  if (!isMainThread) return;

  console.info("Initializing worker listeners...");
  startWorkers(); // Starts all workers

  const workers = getAllWorkers();

  // Relay server events to all workers
  serverEvents.on("*", (type, data)  => {
    for (const worker of workers) {
      worker.postMessage({
        type: "event",
        emitter: "serverEvents",
        type,
        data,
      });
    }
  });
  // Relay worker messages as server events & ready semaphores
  for (const worker of workers) {
    worker.on("message", (msg) => {
      if (msg.type === "event" && msg.emitter === "serverEvents") {
        serverEvents.emit(msg.type, msg.data);
      } else if (msg.type === "ready") {
        setReady(msg.readyLabelKey);
      }
    });
  }
}

