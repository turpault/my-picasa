import { readdir, stat } from "fs/promises";
import { join } from "path";
import { isMainThread, parentPort } from "worker_threads";
import { isPicture, isVideo, sleep } from "../../shared/lib/utils";
import {
  Album,
  AlbumChangeEvent,
  AlbumEntry,
} from "../../shared/types/types";
import { imagesRoot } from "../utils/constants";
import { events } from "../../shared/server-events";
import { pathForAlbum } from "../utils/serverUtils";

const notificationQueue: AlbumChangeEvent[] = [];

export function queueNotification(event: AlbumChangeEvent) {
  notificationQueue.push(event);
}

export async function startAlbumUpdateNotification() {
  while (true) {
    await sleep(1);
    if (notificationQueue.length > 0) {
      events.emit("albumEvent", notificationQueue);
      notificationQueue.splice(0, notificationQueue.length);
    }
  }
}

export async function assetsInFolderAlbum(
  album: Album,
): Promise<{ entries: AlbumEntry[]; folders: string[] }> {
  let items: string[];
  try {
    items = await readdir(join(imagesRoot, pathForAlbum(album)));
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException)?.code;
    if (code === "EACCES" || code === "EPERM") {
      return { entries: [], folders: [] };
    }
    throw err;
  }
  const entries: AlbumEntry[] = [];
  const folders: string[] = [];

  await Promise.all(
    items
      .filter((i) => !i.startsWith("."))
      .map(async (i) => {
        const entry = { album, name: i.normalize() };
        if (isPicture(entry) || isVideo(entry)) {
          entries.push(entry);
        } else {
          try {
            const s = await stat(join(imagesRoot, pathForAlbum(album), i));
            if (s.isDirectory()) {
              folders.push(i);
            }
          } catch (e) {
            console.error(`Error while statting file ${i}: ${e}`);
          }
        }
      }),
  );

  return { entries, folders };
}
