import { buildEmitter, Emitter } from "./lib/event.js";
import { Folder, FolderEvent, Sortable } from "./types/types.js";
import { walk } from "./walker.js";

// Sort by name, but ensures that keys are unique
class SortedList<T extends Sortable> {
  constructor() {
    this.array = [];
  }
  insert(t: T): { position: number; inserted: boolean } {
    const tolower = t.name.toLowerCase();
    // Check if at end
    if (
      this.array.length === 0 ||
      this.array[this.array.length - 1].name.toLowerCase() >= tolower
    ) {
      this.array.push(t);
      return { position: this.array.length - 1, inserted: true };
    }
    // Already exists ?
    let res: { position: number; inserted: boolean };
    if (
      this.array.find((v, idx) => {
        if (v.key === t.key) {
          this.array[idx] = t;
          res = { position: idx, inserted: false };
          return true;
        }
        return false;
      })
    ) {
      return res!;
    }

    for (let idx = 0; idx < this.array.length; idx++) {
      if (this.array[idx].name.toLowerCase() < tolower) {
        this.array.splice(idx, 0, t);
        return { position: idx, inserted: true };
      }
    }
    debugger;
    return { position: -1, inserted: false };
  }
  delete(t: T): Boolean {
    return !!this.array.find((v, idx) => {
      if (v.key === t.key) {
        this.array.splice(idx, 1);
        return true;
      }
      return false;
    });
  }
  array: Array<T>;
}

export async function subFolder(
  root: any,
  key: string
): Promise<{ folder: any; name: string }> {
  const [folderId, name] = key.split("|");
  const folders = folderId.split("/").filter((v) => v);
  for (const f of folders) {
    root = await root.getDirectoryHandle(f);
  }
  return { folder: root, name };
}

export class FolderMonitor {
  constructor(_dh: any /*FileSystemDirectoryHandle*/) {
    this.dh = _dh;
    this.folders = new SortedList();
    this.events = buildEmitter<FolderEvent>();
    this.walk(this.dh);
  }
  folders: SortedList<Folder>;
  events: Emitter<FolderEvent>;

  walk(dh: any) {
    walk(dh, async (type: string, data: any) => this.event(type, data));
  }

  idFromFolderAndName(folder: Folder, name: string): string {
    return folder.key + "|" + name;
  }
  folderAndNameFromId(id: string): { folder: Folder; name: string } {
    const [folderKey, name] = id.split("|");
    const folder = this.folders.array.find(
      (folder) => folder.key == folderKey
    )!;

    return { folder, name };
  }
  private dh: any;
  private async event(type: string, data: any): Promise<boolean> {
    // TODO:
    // Return true if it's
    // a dir that is not excluded
    if (type === "directory") {
      const folder = {
        key: data.path,
        ttl: new Date(),
        name: data.name,
        handle: data.handle,
        pictures: data.pictures,
      };
      const insertRes = this.folders.insert(folder);
      if (insertRes.inserted) {
        this.events.emit("added", {
          folder,
          index: insertRes.position,
          list: this.folders.array,
        });
      } else {
        if (insertRes.position !== -1) {
          this.events.emit("updated", {
            folder,
            index: insertRes.position,
            list: this.folders.array,
          });
        }
      }
    } else if (type === "file") {
    } else if (type === "complete") {
    }
    return true;
  }
}
