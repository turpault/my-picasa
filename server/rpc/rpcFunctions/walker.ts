import { Stats } from "fs";
import { stat } from "fs/promises";
import { join, relative } from "path";
import { Queue } from "../../../shared/lib/queue";
import {
  alphaSorter, sleep,
  sortByKey
} from "../../../shared/lib/utils";
import {
  Album, AlbumChangeEvent, AlbumWithCount
} from "../../../shared/types/types";
import { imagesRoot } from "../../utils/constants";
import { broadcast } from "../../utils/socketList";
import { assetsInAlbum, mediaCount } from "./media";
import {
  fullTextSearch
} from "./picasaIni";

let lastWalk: AlbumWithCount[] = [];
const walkQueue = new Queue(3);


const notificationQueue: AlbumChangeEvent[] = [];

export async function monitorAlbums(): Promise<{}> {
  await broadcast('albums', lastWalk);
  return {};
}

export async function startAlbumUpdateNotification() {
  while(true) {
    await sleep(1);
    if(notificationQueue.length > 0) {
      broadcast('albumEvent', notificationQueue);
      notificationQueue.splice(0,notificationQueue.length);
    }
  }
}

export async function updateLastWalkLoop() {
  let iteration = 0;
  while (true) {
    iteration++;
    console.info(`Starting scan iteration ${iteration}`);
    console.time("Folder scan");
    const old = [...lastWalk];
    walk("", imagesRoot, async (a: Album) => {
      addOrRefreshOrDeleteAlbum(a);
    });
    await walkQueue.drain();
    sortByKey(lastWalk, "key");
    const deletedAlbums: AlbumWithCount[] = [];
    let startIndex = 0;
    for(const oldAlbum of old) {
      if(lastWalk.length < startIndex || lastWalk[startIndex].key > oldAlbum.key) {
        // could not be found, it has been removed
        deletedAlbums.push(oldAlbum);
        continue;
      }
      if(lastWalk[startIndex].key === oldAlbum.key) {
        // found it, do nothing
        startIndex++;
        continue;
      }
      startIndex++;
    }
    for(const oldAlbum of deletedAlbums) {
      addOrRefreshOrDeleteAlbum(oldAlbum);
    }

    console.timeEnd("Folder scan");
    await sleep(60 * 3); // Wait 3 minutes
  }
}

export async function refreshAlbums(albums: Album[]) {
  await Promise.all(albums.map(addOrRefreshOrDeleteAlbum));
}

const ALLOW_EMPTY_ALBUM_CREATED_SINCE=1000 * 60 * 60; // one hour
async function albumExists(album: Album): Promise<boolean> {
  const p = join(imagesRoot, album.key);
  const s = await stat(p).catch(() => false)
  if(s === false) { 
    return false;
  }
  if(Date.now() - (s as Stats).ctime.getTime() < ALLOW_EMPTY_ALBUM_CREATED_SINCE) {
    return true;
  }
  
  const count = (await mediaCount(album)).count;
  if(count !== 0) {
    return true;      
  }
  return false;
}


export async function addOrRefreshOrDeleteAlbum(album: Album) {
  if (lastWalk) {
    if (!(await albumExists(album))) {
      const idx = lastWalk.findIndex((f) => f.key == album.key);
      if (idx >= 0) {
        const data = lastWalk.splice(idx, 1)[0];      
        notificationQueue.push({type: "albumDeleted", data});
      }
    } else {
      const count = (await mediaCount(album)).count;
      const idx = lastWalk.findIndex((f) => f.key == album.key);
      if(idx === -1) {
        notificationQueue.push({type: "albumAdded", data: {...album, count}});
        lastWalk.push({...album, count});
        sortByKey(lastWalk, "key");
      } else {
        if(count !== lastWalk[idx].count) {
          lastWalk[idx].count = count;
          notificationQueue.push({type: "albumCountUpdated", data:{...album, count}});
        }
      }
    }
  }
}

export async function folders(filter: string): Promise<Album[]> {
  if (filter) {
    const filtered: Album[] = [];
    for (const album of lastWalk) {
      if ((await fullTextSearch(album, filter)).length > 0)
        filtered.push(album);
    }
    return filtered;
  }
  return lastWalk!;
}


async function walk(
  name: string,
  path: string,
  cb: (a: Album) => Promise<void>
): Promise<void> {
  const album = { name, key: relative(imagesRoot, path) };
  const m = await assetsInAlbum(album);

  // depth down first
  for(const child of m.folders.sort(alphaSorter(false)).reverse()) {
    walkQueue.add<Album[]>(() => walk(child, join(path, child), cb));      
  }

  if(m.entries.length > 0) {
    cb(album);
  }
}
