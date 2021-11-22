import { Stats } from "fs";
import { readdir, stat } from "fs/promises";
import { extname, join, relative } from "path";
import { lock, sleep, sortByKey } from "../../../shared/lib/utils.js";
import {
  Album,
  AlbumEntry,
  pictureExtensions,
  videoExtensions,
} from "../../../shared/types/types.js";
import { imagesRoot } from "../../utils/constants.js";
import { exifDataAndStats } from "./exif.js";
import { readPicasaIni, updatePicasaEntry } from "./picasaIni.js";

let lastWalk: Album[] | undefined = undefined;
async function updateLastWalk() {
  const l = await lock("updateLastWalk");
  if (!lastWalk) {
    console.info("Updating albums...");
    console.time("updateLastWalk");
    const f = await walk("", imagesRoot);
    sortByKey(f, "name");
    f.forEach((p) => (p.key = relative(imagesRoot, p.key)));
    lastWalk = f;
    console.timeEnd("updateLastWalk");
  }
  l();
}
export async function updateLastWalkLoop() {
  while (true) {
    await updateLastWalk();
    await sleep(300);
  }
}

export function invalidateCachedFolderList() {
  lastWalk = undefined;
}

export async function folders(filter: string): Promise<Album[]> {
  if (!lastWalk) {
    await updateLastWalk();
  }
  if (filter) {
    return lastWalk!.filter((album) =>
      album.name.toLowerCase().includes(filter)
    );
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
  for (const i of items) {
    if (!i.startsWith(".")) {
      const entry = { album, name: i };
      const ext = extname(i).toLowerCase().replace(".", "");
      if (filter && !i.toLowerCase().includes(filter)) {
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

export async function walk(
  name: string,
  path: string,
  mustHaveAssets: boolean = true
): Promise<Album[]> {
  const items = (await readdir(path)).filter((n) => !n.startsWith("."));

  const hasAssets = items.find((item) => {
    const ext = extname(item).toLowerCase().replace(".", "");
    return pictureExtensions.includes(ext) || videoExtensions.includes(ext);
  });
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
      folders.push({ name: items[idx], key: join(path, items[idx]) });
    }
    idx++;
  }
  const p = await Promise.all(
    folders.map((folder) => walk(folder.name, folder.key))
  );

  const all = p.flat();
  if (hasAssets || !mustHaveAssets) {
    all.push({ name, key: path });
  }
  return all;
}
