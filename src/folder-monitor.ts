import { buildEmitter, Emitter } from "./lib/event.js";
import { walk } from "./walker.js";
export type Sortable = {
  key: string;
  name: string;
};

export type Folder = Sortable & {
  ttl: Date;
  name: string;
  handle: any;
  pictures: any;
};

type Events = {
  added: { folder: Folder; index: number; list: Array<Folder> };
  updated: { folder: Folder; index: number; list: Array<Folder> };
  removed: { folder: Folder; index: number; list: Array<Folder> };
};

class SortedList<T extends Sortable> {
  constructor(isBefore: Function) {
    this.array = [];
    this.sorter = isBefore;
  }
  insert(t: T): { position: number; inserted: boolean } {
    const i = this.indexOf(this.array, t, 0, this.array.length);
    if (i !== -1) {
      // Appended
      if (i === this.array.length) {
        this.array.push(t);
        return { position: i, inserted: true };
      }
      if (this.array[i] && this.array[i].name === t.name) {
        // replace existing
        this.array[i] = t;
        return { position: i, inserted: false };
      }
      if (i > 0 && this.array[i - 1].name <= t.name) {
        debugger;
      }
      if (this.array[i].name > t.name) {
        debugger;
      }
      if (this.array.find((d) => d.name === t.name)) {
        debugger;
      }
      this.array.splice(i, 0, t);
      return { position: i, inserted: true };
    }
    return { position: -1, inserted: false };
  }
  delete(t: T): Boolean {
    const i = this.indexOf(this.array, t, 0, this.array.length);
    if (i !== -1) {
      if (this.array[i].key == t.key) {
        this.array.splice(i, 1);
        return true;
      }
    }
    return false;
  }

  private indexOf(arr: Array<T>, x: T, start: number, end: number): number {
    // Base Condition
    if (start > end) return -1;
    if (start === end) {
      return start;
    }
    // Quick check - is at end
    if (arr[end - 1].key >= x.key) {
      return end;
    }
    // Quick check - is at start
    if (arr[start].key <= x.key) {
      return start;
    }
    // Find the middle index
    let mid = Math.floor((start + end) / 2);

    // If element at mid is greater than x,
    // search in the left half of mid
    if (this.sorter(arr[mid], x)) {
      return this.indexOf(arr, x, start, mid - 1);
    } else if (!this.sorter(x, arr[mid])) {
      // Found one match,
      return mid;
    } else {
      // If element at mid is smaller than x,
      // search in the right half of mid
      return this.indexOf(arr, x, mid + 1, end);
    }
  }
  array: Array<T>;
  private sorter: Function;
}

export class FolderMonitor {
  constructor(_dh: any /*FileSystemDirectoryHandle*/) {
    this.dh = _dh;
    this.folders = new SortedList((a: Folder, b: Folder) => {
      return a.name.toLowerCase() < b.name.toLowerCase();
    });
    this.events = buildEmitter<Events>();
    this.tockP = () => {};
    const doTick = () => {
      this.tick();
      window.requestAnimationFrame(doTick);
    };
    doTick();
    console.time("Loop");
    const walker = async () => {
      console.timeEnd("Loop");
      console.time("Loop");
      walk(_dh, async (type: string, data: any) => this.event(type, data)).then(
        walker
      );
    };
    walker();
  }
  folders: SortedList<Folder>;
  events: Emitter<Events>;
  private tick() {
    this.tockP(true);
  }
  private async tock() {
    const p = new Promise<boolean>((resolve) => (this.tockP = resolve));
    await p;
  }

  private tockP: Function;
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
      await this.tock();
    } else if (type === "file") {
    } else if (type === "complete") {
    }
    // Save in the dir list if it contains an image file
    return true;
  }
}
