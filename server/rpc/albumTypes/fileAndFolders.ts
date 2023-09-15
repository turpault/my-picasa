import { readdir, stat } from "fs/promises";
import { join } from "path";
import { isPicture, isVideo, sleep } from "../../../shared/lib/utils";
import {
  Album,
  AlbumChangeEvent,
  AlbumEntry,
  AlbumKind,
  idFromKey,
} from "../../../shared/types/types";
import { imagesRoot } from "../../utils/constants";
import { broadcast } from "../../utils/socketList";

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
  album: Album
): Promise<{ entries: AlbumEntry[]; folders: string[] }> {
  if (album.kind !== AlbumKind.FOLDER) {
    throw new Error("Can only scan folders");
  }
  const items = await readdir(join(imagesRoot, idFromKey(album.key).id));
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
          const s = await stat(join(imagesRoot, idFromKey(album.key).id, i));
          if (s.isDirectory()) {
            folders.push(i);
          }
        }
      })
  );

  return { entries, folders };
}
