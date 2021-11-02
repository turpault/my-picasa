import { Directory } from "./lib/handles.js";
import { getService } from "./rpc/connect.js";
import { FolderEntry } from "../shared/types/types.js";

export async function walkFromServer(): Promise<
  { name: string; path: string }[]
> {
  const s = await getService();
  return s.service.folders();
}

export async function folderContents(
  fh: Directory
): Promise<{
  pictures: FolderEntry[];
  videos: FolderEntry[];
  subfolders: FolderEntry[];
}> {
  const lst: {
    name: string;
    kind: string;
    handle: any;
  }[] = await fh.getFiles();
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
