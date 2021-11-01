import { readdir, stat } from "fs/promises";
import { extname, join, relative } from "path";
import { imagesRoot } from "../utils/constants";

type Album = {
  name: string;
  path: string;
};
const pictureExtensions = ["jpeg", "jpg", "png", "gif"];
const videoExtensions = ["mp4", "mov"];

let lastWalk: Album[] | undefined = undefined;
async function updateLastWalk() {
  const f = await walk("", imagesRoot);
  const sorted = f.sort((a, b) =>
    a.name > b.name ? -1 : a.name < b.name ? 1 : 0
  );
  sorted.forEach((p) => (p.path = relative(imagesRoot, p.path)));
  lastWalk = sorted;
}
setInterval(() => updateLastWalk(), 120000);
updateLastWalk();

export async function folders(): Promise<Album[]> {
  if (!lastWalk) {
    await updateLastWalk();
  }
  return lastWalk!;
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
  const stats = await Promise.all(items.map((item) => stat(join(path, item))));

  const folders: { name: string; path: string }[] = [];
  let idx = 0;
  for (const item of items) {
    if (stats[idx].isDirectory() && !item.startsWith(".")) {
      folders.push({ name: items[idx], path: join(path, items[idx]) });
    }
    idx++;
  }
  const p = await Promise.all(
    folders.map((folder) => walk(folder.name, folder.path))
  );

  const all = p.flat();
  if (hasPics) {
    all.push({ name, path });
  }
  return all;
}
