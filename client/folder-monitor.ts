import { buildEmitter, Emitter } from "../shared/lib/event.js";
import { Directory } from "./lib/handles.js";
import { Folder, FolderEvent } from "../shared/types/types.js";
import { walkFromServer } from "./walker.js";

export async function subFolder(
  key: string
): Promise<{ folder: Directory; name: string }> {
  const [folderId, name] = key.split("|");
  const folder = new Directory("", folderId);
  return { folder, name };
}

export class FolderMonitor {
  constructor() {
    this.folders = [];
    this.events = buildEmitter<FolderEvent>();
    this.walk();
  }
  folders: Folder[];
  events: Emitter<FolderEvent>;

  async walk() {
    const lst = await walkFromServer();
    this.folders = lst.map((e) => ({
      name: e.name,
      key: e.path,
      handle: new Directory(e.name, e.path),
    }));
    this.events.emit("updated", { folders: this.folders });
  }

  idFromFolderAndName(folder: Folder, name: string): string {
    return folder.key + "|" + name;
  }
  folderAndNameFromId(id: string): { folder: Folder; name: string } {
    const [folderKey, name] = id.split("|");
    const folder = this.folders.find((folder) => folder.key == folderKey)!;

    return { folder, name };
  }
}
