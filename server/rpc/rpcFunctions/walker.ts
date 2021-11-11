import { Stats } from "fs";
import { readdir, stat } from "fs/promises";
import { extname, join, relative } from "path";
import { sortByKey } from "../../../shared/lib/utils";
import { Album } from "../../../shared/types/types";
import { imagesRoot } from "../../utils/constants";

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

export async function folders(): Promise<Album[]> {
  if (!lastWalk) {
    await updateLastWalk();
  }
  return lastWalk!;
}

export async function mediaInFolder(
  path: string
): Promise<{ pictures: string[]; videos: string[] }> {
  const items = await readdir(join(imagesRoot, path));
  const pictures: string[] = [];
  const videos: string[] = [];
  for (const i of items) {
    if (!i.startsWith(".")) {
      const ext = extname(i).toLowerCase().replace(".", "");
      if (pictureExtensions.includes(ext)) {
        pictures.push(i);
      }
      if (videoExtensions.includes(ext)) {
        videos.push(i);
      }
    }
  }
  return { pictures, videos };
}

export async function walk(name: string, path: string): Promise<Album[]> {
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
  if (hasPics) {
    all.push({ name, key: path });
  }
  return all;
}
