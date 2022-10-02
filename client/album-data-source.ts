import { sortByKey } from "../shared/lib/utils";
import {
  Album,
  AlbumChangeEvent,
  AlbumInfo,
  AlbumWithCount,
} from "../shared/types/types";
import { buildEmitter, Emitter } from "../shared/lib/event";
import { getService } from "./rpc/connect";
import { filteredAlbums } from "./walker";
import { AlbumListEvent } from "./uiTypes";

export type AlbumSortOrder = "ReverseDate" | "ForwardDate";
export class AlbumIndexedDataSource {
  constructor() {
    this.albums = [];
    this.sort = "ReverseDate";
    const albumEmitter = buildEmitter<AlbumListEvent>();
    this.emitter = albumEmitter;
  }

  async init() {
    const s = await getService();
    return new Promise<void>((resolve) => {
      s.monitorAlbums();
      this.unreg = s.on("albumEvent", async (e: any) => {
        let invalidationsFrom = [],
          invalidationsTo = [];
        for (const event of e.payload as AlbumChangeEvent[]) {
          switch (event.type) {
            case "albums":
              invalidationsFrom.push(
                ...this.albums.slice().map((album) => this.removeAlbum(album))
              );
              invalidationsFrom.push(
                ...event.albums!.map((album) => this.addAlbum(album))
              );

              resolve();
              break;
            case "albumDeleted":
              invalidationsFrom.push(this.removeAlbum(event.album!));
              break;
            case "albumCountUpdated":
            case "albumOrderUpdated":
              invalidationsFrom.push(this.updatedAlbum(event.album!));
              break;
            case "albumMoved":
              const up = this.movedAlbum(event.album!, event.altAlbum!);
              if (up) {
                invalidationsFrom.push(up.idx);
                invalidationsTo.push(up.idx2);
              }
              break;
            case "albumAdded":
              invalidationsFrom.push(this.addAlbum(event.album!));
          }
        }
        const from = invalidationsFrom.filter(
          (v) => v !== undefined
        ) as number[];
        const to = invalidationsTo.filter((v) => v !== undefined) as number[];
        if (from.length === 1 && to.length === 1 && from[0] === to[0]) {
          this.emitter.emit("invalidateAt", { index: from[0] });
        } else {
          this.emitter.emit("invalidateFrom", {
            index: Math.min(...from, ...to),
          });
        }
      });
    });
  }
  async destroy() {
    if (this.unreg) this.unreg();
  }

  async resync(filter: string) {
    const lst = await filteredAlbums(filter);
    this.albums = lst;
    this.sortFolders();
    this, this.emitter.emit("invalidateFrom", { index: 0 });
  }

  private addAlbum(album: AlbumWithCount) {
    // Find at which index the album should be added
    let index = this.albums.findIndex((a) => a.key === album.key);
    if (index !== -1) {
      return;
    }
    this.albums.push(album);
    this.sortFolders();
    // find where the album is, and invalidate from that point
    index = this.albums.findIndex((a) => a.key === album.key);
    if (index === -1) {
      throw new Error("Album not found");
    }
    return index;
  }

  private movedAlbum(from: AlbumWithCount, to: AlbumWithCount) {
    const idx = this.albums.findIndex((a) => a.key === from.key);
    if (idx !== -1) {
      this.albums.splice(idx, 1);
      this.albums.push(to);
      this.sortFolders();
      const idx2 = this.albums.findIndex((a) => a.key === to.key);
      return { idx, idx2 };
    }
    return;
  }

  private removeAlbum(album: Album) {
    const idx = this.albums.findIndex((a) => a.key === album.key);
    if (idx !== -1) {
      this.albums.splice(idx, 1);
      return idx;
    }
    return;
  }
  private updatedAlbum(album: Album) {
    const idx = this.albums.findIndex((a) => a.key === album.key);
    if (idx !== -1) {
      this.emitter.emit("invalidateAt", {
        index: this.albums.findIndex((a) => a.key === album.key),
      });
      return idx;
    }
    return;
  }

  albumAtIndex(index: number): AlbumWithCount {
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
    sortByKey(this.albums, "name", this.sort.includes("Reverse"));
  }

  private albums: AlbumWithCount[];
  public emitter: Emitter<AlbumListEvent>;
  private sort: AlbumSortOrder;
  private unreg: Function | undefined;
}
