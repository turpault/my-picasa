import { Stats } from "fs";
import { readdir, stat } from "fs/promises";
import { extname, join, relative } from "path";
import { sortByKey } from "../../../shared/lib/utils";
import { Album, AlbumEntry } from "../../../shared/types/types";
import { imagesRoot } from "../../utils/constants";
import { exifData } from "./exif";
import { readPicasaIni, updatePicasaEntry, writePicasaIni } from "./picasaIni";

const pictureExtensions = ["jpeg", "jpg", "png", "gif"];
const videoExtensions = ["mp4", "mov"];

let lastWalk: Album[] | undefined = undefined;
async function updateLastWalk() {
  const f = await walk("", imagesRoot);
  sortByKey(f, "name");
  f.forEach((p) => (p.key = relative(imagesRoot, p.key)));
  lastWalk = f;
}
setInterval(() => updateLastWalk(), 120000);
updateLastWalk();

export function invalidateCachedFolderList() {
  lastWalk = undefined;
}

export async function folders(): Promise<Album[]> {
  if (!lastWalk) {
    await updateLastWalk();
  }
  return lastWalk!;
}

export async function mediaInAlbum(
  album: Album
): Promise<{ pictures: AlbumEntry[]; videos: AlbumEntry[] }> {
  const items = await readdir(join(imagesRoot, album.key));
  const picasa = await readPicasaIni(album);
  const pictures: AlbumEntry[] = [];
  const videos: AlbumEntry[] = [];
  for (const i of items) {
    if (!i.startsWith(".")) {
      const entry = { album, name: i };
      const ext = extname(i).toLowerCase().replace(".", "");
      if (pictureExtensions.includes(ext)) {
        if (!picasa[i] || !picasa[i].dateTaken) {
          const exif = await exifData(entry);
          if (exif.DateTimeOriginal)
            updatePicasaEntry(entry, "dateTaken", exif.DateTimeOriginal);
          else {
            // Default to file creation time
            updatePicasaEntry(
              entry,
              "dateTaken",
              exif.stats.ctime.toISOString()
            );
          }
        }
        pictures.push(entry);
      }
      if (videoExtensions.includes(ext)) {
        videos.push(entry);
      }
    }
  }
  return { pictures, videos };
}

export async function walk(
  name: string,
  path: string,
  mustHavePics: boolean = false
): Promise<Album[]> {
  const items = await readdir(path);
  const hasPics = items.find((item) => {
    const ext = extname(item).toLowerCase().replace(".", "");
    return (
      (pictureExtensions.includes(ext) || videoExtensions.includes(ext)) &&
      !item.startsWith(".")
    );
  });
  const stats = await Promise.allSettled(
    items.map((item) => stat(join(path, item)))
  );

  const folders: { name: string; key: string }[] = [];
  let idx = 0;
  for (const item of items) {
    if (
      stats[idx].status === "fulfilled" &&
      ((stats[idx] as any).value as Stats).isDirectory() &&
      !item.startsWith(".")
    ) {
      folders.push({ name: items[idx], key: join(path, items[idx]) });
    }
    idx++;
  }
  const p = await Promise.all(
    folders.map((folder) => walk(folder.name, folder.key))
  );

  const all = p.flat();
  if (hasPics || !mustHavePics) {
    all.push({ name, key: path });
  }
  return all;
}
