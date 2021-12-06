import { buildEmitter, Emitter } from "../shared/lib/event";
import { sortByKey } from "../shared/lib/utils";
import { Album, FolderEvent } from "../shared/types/types";
import { getSettings, getSettingsEmitter } from "./lib/settings";
import { walkFromServer } from "./walker";

export type AlbumSortOrder = "ReverseDate" | "ForwardDate";
export class FolderMonitor {
  constructor() {
    this.albums = [];
    this.events = buildEmitter<FolderEvent>();
    this.sort = "ReverseDate";
  }

  events: Emitter<FolderEvent>;

  async ready() {
    return this.walk();
  }

  async walk() {
    const lst = await walkFromServer("");
    this.albums = lst;
    this.sortFolders();
    this.events.emit("updated", { folders: this.albums });
  }

  albumAtIndex(index: number): Album {
    if (index > this.albums.length) {
      throw new Error("out of bounds");
    }
    return this.albums[index];
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
