import { Stats } from "fs";
import { readdir, stat } from "fs/promises";
import { extname, join, relative } from "path";
import { inspect } from "util";
import { Queue } from "../../../shared/lib/queue";
import { isMediaUrl, sleep, sortByKey } from "../../../shared/lib/utils";
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

export async function updateLastWalkLoop() {
  let iteration = 0;
  let keys: { [key: string]: number } = {};
  while (true) {
    iteration++;
    console.info(`Starting scan iteration ${iteration}`);
    console.time("Folder scan");
    let updates = 0;
    walk("", imagesRoot, (a: Album, entries: AlbumEntry[]) => {
      if (entries.length > 0) {
        if (!keys[a.key]) {
          lastWalk.push(a);
          sortByKey(lastWalk, "name");
          updates++;
        }
        if (99 === updates % 100) {
          broadcast("updateAlbumList", {});
        }
        // precache the contents of the picasa.ini file
        readPicasaIni(a);
        for (const entry of entries) {
          touchPicasaEntry(entry);
        }
        keys[a.key] = iteration;
      }
    });
    await walkQueue.drain();

    for (const k in keys) {
      if (keys[k] !== iteration) {
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

export function refreshAlbums(albums: Album[]) {
  for (const a of albums) {
    addOrRefreshAlbum(a);
  }
}

function addOrRefreshAlbum(album: Album) {
  if (lastWalk && !lastWalk.find((f) => f.key == album.key)) {
    lastWalk.push(album);
    sortByKey(lastWalk, "name");
  }
}

export async function folders(filter: string): Promise<Album[]> {
  if (filter) {
    const filtered = lastWalk!.filter(
      (album) => fullTextSearch(album, filter).length > 0
    );
    return filtered;
  }
  return lastWalk!;
}

export async function media(
  album: Album,
  filter: string
): Promise<{ assets: AlbumEntry[] }> {
  const items = await readdir(join(imagesRoot, album.key));
  const picasa = readPicasaIni(album);
  const assets: AlbumEntry[] = [];

  if (filter) {
    return { assets: fullTextSearch(album, filter) };
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
  cb: (a: Album, entries: AlbumEntry[]) => void,
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
  folders.forEach((folder) =>
    walkQueue.add<Album[]>(() =>
      walk(folder.name, folder.key, cb, mustHaveAssets)
    )
  );

  if (hasAssets || !mustHaveAssets) {
    const album = { name, key: relative(imagesRoot, path) };
    cb(
      album,
      hasAssets.map((name) => ({ album, name }))
    );
  }
}
