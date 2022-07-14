import { sortByKey } from "../shared/lib/utils";
import { Album, AlbumChangeEvent, AlbumInfo } from "../shared/types/types";
import { buildEmitter, Emitter } from "../shared/lib/event";
import { getService } from "./rpc/connect";
import { filteredAlbums } from "./walker";

export type AlbumIndexedDataSourceEvents = {
  invalidateFrom: {
    index: number;
  };
  invalidateAt: {
    index: number;
  };
};
export type AlbumSortOrder = "ReverseDate" | "ForwardDate";
export class AlbumIndexedDataSource {
  constructor() {
    this.albums = [];
    this.sort = "ReverseDate";
    this.emitter = buildEmitter<AlbumIndexedDataSourceEvents>();
  }

  async init() {
    const s = await getService();
    this.unreg = s.on("albumEvent", async (e: any) => {
      for (const event of e.payload as AlbumChangeEvent[]) {
        switch (event.type) {
          case "albumDeleted":
            this.removeAlbum(event.data);
            break;
          case "albumCountUpdated":
          case "albumOrderUpdated":
              this.updatedAlbum(event.data);
            break;
          case "albumMoved":
            this.movedAlbum(event.data, event.data2!);
            break;
          case "albumAdded":
            this.addAlbum(event.data);
        }
      }
    });
  }
  async destroy() {
    if (this.unreg) this.unreg();
  }

  async resync(filter: string) {
    const lst = await filteredAlbums(filter);
    this.albums = lst;
    this.sortFolders();
  }

  addAlbum(album: Album) {
    // Find at which index the album should be added
    this.albums.push(album);
    this.sortFolders();
    // find where the album is, and invalidate from that point
    this.emitter.emit("invalidateFrom", {
      index: this.albums.findIndex((a) => a.key === album.key),
    });
  }

  movedAlbum(from: Album, to: Album) {
    const idx = this.albums.findIndex((a) => a.key === from.key);
    this.albums.splice(idx, 1);
    this.albums.push(to);
    this.sortFolders();
    const idx2 = this.albums.findIndex((a) => a.key === to.key);

    if (idx === idx2) {
      this.emitter.emit("invalidateAt", { index: idx });
    } else {
      this.emitter.emit("invalidateFrom", { index: Math.min(idx, idx2) });
    }
  }
  removeAlbum(album: Album) {
    const idx = this.albums.findIndex((a) => a.key === album.key);
    if (idx !== -1) {
      this.albums.splice(idx, 1);
      this.emitter.emit("invalidateFrom", {
        index: idx,
      });
    }
  }
  updatedAlbum(album: Album) {
    const idx = this.albums.findIndex((a) => a.key === album.key);
    if (idx !== -1) {
      this.emitter.emit("invalidateAt", {
        index: this.albums.findIndex((a) => a.key === album.key),
      });
    }
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
  public emitter: Emitter<AlbumIndexedDataSourceEvents>;
  private sort: AlbumSortOrder;
  private unreg: Function | undefined;
}
