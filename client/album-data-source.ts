import { sortByKey } from "../shared/lib/utils";
import { Album } from "./types/types";
import { walkFromServer } from "./walker";

export type AlbumSortOrder = "ReverseDate" | "ForwardDate";
export class AlbumDataSource {
  constructor() {
    this.albums = [];
    this.sort = "ReverseDate";
  }

  async walk(filter: string) {
    const lst = await walkFromServer(filter);
    this.albums = lst;
    this.sortFolders();
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
