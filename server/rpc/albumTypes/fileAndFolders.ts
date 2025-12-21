import { readdir, stat } from "fs/promises";
import { join } from "path";
import { isPicture, isVideo, sleep } from "../../../shared/lib/utils";
import {
  Album,
  AlbumChangeEvent,
  AlbumEntry,
  AlbumKind,
} from "../../../shared/types/types";
import { imagesRoot } from "../../utils/constants";
import { broadcast } from "../../utils/socketList";
import { pathForAlbum } from "../../utils/serverUtils";
import { fileFoundEventEmitter, listedMediaEventEmitter } from "../../walker";

const notificationQueue: AlbumChangeEvent[] = [];

export function queueNotification(event: AlbumChangeEvent) {
  notificationQueue.push(event);
}

export async function startAlbumUpdateNotification() {
  while (true) {
    await sleep(1);
    if (notificationQueue.length > 0) {
      broadcast("albumEvent", notificationQueue);
      notificationQueue.splice(0, notificationQueue.length);
    }
  }
}

export async function assetsInFolderAlbum(
  album: Album,
): Promise<{ entries: AlbumEntry[]; folders: string[] }> {
  if (album.kind !== AlbumKind.FOLDER) {
    throw new Error("Can only scan folders");
  }
  const items = await readdir(join(imagesRoot, pathForAlbum(album)));
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
  listedMediaEventEmitter.emit("assetsInFolderAlbum", { album, entries });

  return { entries, folders };
}
