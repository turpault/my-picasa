import { Stats } from "fs";
import { readdir, stat } from "fs/promises";
import { extname, join, relative } from "path";
import { bool } from "sharp";
import { inspect } from "util";
import { Queue } from "../../../shared/lib/queue";
import {
  debounce,
  isMediaUrl,
  sleep,
  sortByKey,
} from "../../../shared/lib/utils";
import {
  Album,
  AlbumEntry,
  pictureExtensions,
  videoExtensions,
} from "../../../shared/types/types";
import { imagesRoot } from "../../utils/constants";
import { broadcast } from "../../utils/socketList";
import { exifDataAndStats } from "./exif";
import {
  fullTextSearch,
  readPicasaIni,
  touchPicasaEntry,
  updatePicasaEntry,
} from "./picasaIni";

let lastWalk: Album[] = [];
const walkQueue = new Queue(3);

let keys: { [key: string]: number } = {};
const notify = () => {
  console.info("Broadcast", lastWalk.length);
  broadcast("updateAlbumList", {});
};
export function addAlbumToList(a: Album, iteration: number = 0): boolean {
  if (!keys[a.key]) {
    keys[a.key] = iteration;
    lastWalk.push(a);
    debounce(notify, 1000);

    return true;
  }
  keys[a.key] = iteration;
  return false;
}

export function renameAlbum(a: Album, newName: string) {
  for (const alb of lastWalk) {
    if (alb.key == a.key) {
    }
  }
}

export async function updateLastWalkLoop() {
  let iteration = 0;
  while (true) {
    iteration++;
    console.info(`Starting scan iteration ${iteration}`);
    console.time("Folder scan");
    let updates = 0;
    walk("", imagesRoot, async (a: Album, entries: AlbumEntry[]) => {
      if (entries.length > 0) {
        addAlbumToList(a, iteration);

        // precache the contents of the picasa.ini file
        await readPicasaIni(a);
        for (const entry of entries) {
          touchPicasaEntry(entry);
        }
      }
    });
    await walkQueue.drain();
    sortByKey(lastWalk, "name");
    lastWalk.reverse();

    for (const k in keys) {
      if (keys[k] !== iteration && keys[k] != 0) {
        delete keys[k];
        // Remove from lastWalk
        const idx = lastWalk.findIndex((a) => a.key === k);
        lastWalk.splice(idx, 1);
        updates++;
      }
    }

    if (updates) {
      broadcast("updateAlbumList", {});
    }
    console.timeEnd("Folder scan");

    await sleep(60 * 3); // Wait 3 minutes
  }
}

export async function refreshAlbums(albums: Album[]) {
  await Promise.all(albums.map(addOrRefreshOrDeleteAlbum));
  broadcast("albumChanged", albums);
}

async function albumExists(album: Album): Promise<boolean> {
  const p = join(imagesRoot, album.key);
  return await stat(p)
    .then(() => true)
    .catch(() => false);
}

async function addOrRefreshOrDeleteAlbum(album: Album) {
  if (lastWalk) {
    const idx = lastWalk.findIndex((f) => f.key == album.key);
    if (!(await albumExists(album))) {
      if (idx >= 0) {
        lastWalk.splice(idx, 1);
      }
    } else if (idx === -1) {
      lastWalk.push(album);
      sortByKey(lastWalk, "name");
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

export async function media(
  album: Album,
  filter: string
): Promise<{ assets: AlbumEntry[] }> {
  const items = await readdir(join(imagesRoot, album.key));
  const picasa = await readPicasaIni(album);
  const assets: AlbumEntry[] = [];

  if (filter) {
    return { assets: await fullTextSearch(album, filter) };
  }
  for (const i of items) {
    if (!i.startsWith(".")) {
      const entry = { album, name: i };
      const ext = extname(i).toLowerCase().replace(".", "");
      if (
        filter &&
        !(album.key + album.name + i + JSON.stringify(picasa[i]))
          .toLowerCase()
          .includes(filter)
      ) {
        continue;
      }
      if (pictureExtensions.includes(ext)) {
        if (!picasa[i] || !picasa[i].dateTaken) {
          const exif = await exifDataAndStats(entry);
          if (exif.tags.DateTimeOriginal)
            updatePicasaEntry(
              entry,
              "dateTaken",
              exif.tags.DateTimeOriginal.toISOString()
            );
          else if (exif.stats) {
            // Default to file creation time
            updatePicasaEntry(
              entry,
              "dateTaken",
              exif.stats.ctime.toISOString()
            );
          }
        }
        assets.push(entry);
      }
      if (videoExtensions.includes(ext)) {
        assets.push(entry);
      }
    }
  }
  return { assets };
}

async function walk(
  name: string,
  path: string,
  cb: (a: Album, entries: AlbumEntry[]) => Promise<void>,
  mustHaveAssets: boolean = true
): Promise<void> {
  const items = (await readdir(path)).filter((n) => !n.startsWith("."));

  const hasAssets = items.filter((i) => isMediaUrl(i));
  const stats = await Promise.allSettled(
    items.map((item) => stat(join(path, item)))
  );

  const folders: { name: string; key: string }[] = [];
  let idx = 0;
  for (const item of items) {
    if (
      stats[idx].status === "fulfilled" &&
      ((stats[idx] as any).value as Stats).isDirectory()
    ) {
      folders.push({ name: item, key: join(path, item) });
    }
    idx++;
  }
  sortByKey(folders, "name");
  folders
    .reverse()
    .forEach((folder) =>
      walkQueue.add<Album[]>(() =>
        walk(folder.name, folder.key, cb, mustHaveAssets)
      )
    );

  if (hasAssets || !mustHaveAssets) {
    const album = { name, key: relative(imagesRoot, path) };
    await cb(
      album,
      hasAssets.map((name) => ({ album, name }))
    );
  }
}
