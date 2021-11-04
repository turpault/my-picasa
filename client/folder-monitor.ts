import { buildEmitter, Emitter } from "../shared/lib/event.js";
import { sortByKey } from "../shared/lib/utils.js";
import { Album, FolderEvent } from "../shared/types/types.js";
import { getService } from "./rpc/connect.js";
import { walkFromServer } from "./walker.js";

export type AlbumSortOrder = "ReverseDate" | "ForwardDate";
export class FolderMonitor {
  constructor() {
    this.albums = [];
    this.events = buildEmitter<FolderEvent>();
    this.walk();
    this.sort = "ReverseDate";
  }

  events: Emitter<FolderEvent>;

  async walk() {
    const lst = await walkFromServer();
    this.albums = lst;
    this.sortFolders();
    this.events.emit("updated", { folders: this.albums });
    (await getService()).on(
      "foldersChanged",
      (lst: { name: string; path: string }[]) => {
        this.albums = lst.map((e) => ({
          name: e.name,
          key: e.path,
        }));
        this.sortFolders();
        this.events.emit("updated", { folders: this.albums });
      }
    );
  }

  albumAtIndex(index: number): Album {
    if (index > this.albums.length) {
      throw new Error("out of bounds");
    }
    return this.albums[index];
  }

  albumFromKey(key: string): Album | undefined {
    return this.albums.find((f) => f.key === key);
  }

  albumIndexFromKey(key: string): number {
    return this.albums.findIndex((f) => f.key === key);
  }

  length(): number {
    return this.albums.length;
  }

  private sortFolders() {
    sortByKey(this.albums, "name");
    if (this.sort === "ReverseDate") {
      this.albums.reverse();
    }
  }
  private albums: Album[];
  private sort: AlbumSortOrder;
}
