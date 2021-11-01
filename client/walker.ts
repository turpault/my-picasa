import { Directory } from "./lib/handles";
import { Folder, FolderEntry } from "./types/types";

export async function walkFromServer(): Promise<
  { name: string; path: string }[]
> {
  return fetch("/folders").then((v) => v.json());
}

export async function walk(
  dir: any,
  cb: Function,
  parent: string = ""
): Promise<void> {
  const { pictures, videos, subfolders } = await folderContents(dir);

  const sorted = subfolders.sort((a, b) => {
    return a.name < b.name ? 1 : a.name > b.name ? -1 : 0;
  });

  if (pictures.length > 0 || videos.length > 0) {
    // Generate a folder object
    const folder: Folder = {
      key: parent,
      name: dir.name,
      handle: dir,
    };
    await cb("directory", { folder, pictures, videos });
  }

  // enumerate subfolders
  for (const f of sorted) {
    const path = parent + "/" + f.name;
    if (f.name.substr(0, 1) !== ".") {
      await walk(f.handle, cb, path);
    }
  }
}

export async function folderContents(fh: Directory): Promise<{
  pictures: FolderEntry[];
  videos: FolderEntry[];
  subfolders: FolderEntry[];
}> {
  const lst: { name: string; kind: string; handle: any }[] =
    await fh.getFiles();
  const pictures: FolderEntry[] = [];
  const videos: FolderEntry[] = [];
  const subfolders: FolderEntry[] = [];
  const pictureExtensions = ["jpeg", "jpg", "png", "gif"];
  const videoExtensions = ["mp4", "mov"];

  for (const a of lst) {
    const ext = a.name.split(".").pop()!.toLowerCase();
    if (
      a.kind === "file" &&
      pictureExtensions.includes(ext) &&
      !a.name.startsWith(".")
    )
      pictures.push(a);

    if (
      a.kind === "file" &&
      videoExtensions.includes(ext) &&
      !a.name.startsWith(".")
    )
      videos.push(a);
    if (a.kind === "directory") {
      subfolders.push(a);
    }
  }
  return { pictures, videos, subfolders };
}
