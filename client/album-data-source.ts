import { albumInFilter, removeDiacritics, sortByKey } from "../shared/lib/utils";
import {
  Album,
  AlbumChangeEvent,
  AlbumInfo,
  AlbumWithData,
} from "../shared/types/types";
import { buildEmitter, Emitter } from "../shared/lib/event";
import { getService } from "./rpc/connect";
import { filteredAlbums } from "./walker";
import { AlbumListEvent } from "./uiTypes";

export type AlbumSortOrder = "ReverseDate" | "ForwardDate";
export class AlbumIndexedDataSource {
  constructor() {
    this.albums = [];
    this.allAlbums = [];
    this.filter = null;
    this.shortcuts = {};
    this.sort = "ReverseDate";
    const albumEmitter = buildEmitter<AlbumListEvent>();
    this.emitter = albumEmitter;
  }

  async init() {
    const s = await getService();
    this.shortcuts = await s.getShortcuts();
    return new Promise<void>((resolve) => {
      s.monitorAlbums();
      let gotEvent = false;
      s.on("shortcutsUpdated", async () => {
        this.shortcuts = await s.getShortcuts();
      });
      this.unreg = s.on("albumEvent", async (e: any) => {
        let invalidationsFrom = [],
          invalidationsTo = [];
        for (const event of e.payload as AlbumChangeEvent[]) {
          if (!gotEvent && event.type !== "albums") {
            continue;
          }
          switch (event.type) {
            case "albums":
              {
                gotEvent = true;
                this.allAlbums = event.albums!;
                this.sortFolders();
                invalidationsFrom.push(0);
                resolve();
              }
              break;
            case "albumDeleted":
              invalidationsFrom.push(this.removeAlbum(event.album!));
              break;
            case "albumInfoUpdated":
              {
                const up = this.updatedAlbum(event.album!);
                if (up) {
                  invalidationsFrom.push(up.idx);
                  invalidationsTo.push(up.idx2);
                }
              }
              break;
            case "albumOrderUpdated":
              invalidationsFrom.push(this.updatedAlbum(event.album!));
              break;
            case "albumMoved":
              {
                const up = this.movedAlbum(event.album!, event.altAlbum!);
                if (up) {
                  invalidationsFrom.push(up.idx);
                  invalidationsTo.push(up.idx2);
                }
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
        if (Math.min(...from) === Math.min(...to) && Math.max(...from) === Math.max(...to)) {
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

  async setFilter(filter: string) {
    this.filter = removeDiacritics(filter.toLowerCase());
    this.sortFolders();
    this.emitter.emit("invalidateFrom", { index: 0 });
  }

  private addAlbum(album: AlbumWithData) {
    // Find at which index the album should be added
    let index = this.allAlbums.findIndex((a) => a.key === album.key);
    if (index !== -1) {
      return;
    }
    this.allAlbums.push(album);
    this.sortFolders();
    // find where the album is, and invalidate from that point
    index = this.albums.findIndex((a) => a.key === album.key);
    if (index === -1) {
      throw new Error("Album not found");
    }
    return index;
  }

  private movedAlbum(from: AlbumWithData, to: AlbumWithData) {
    const idxAll = this.allAlbums.findIndex((a) => a.key === from.key);
    if (idxAll !== -1) {
      const idx = this.albums.findIndex((a) => a.key === from.key);
      this.allAlbums.splice(idx, 1);
      this.allAlbums.push(to);
      this.sortFolders();
      if(idx) {
        const idx2 = this.albums.findIndex((a) => a.key === to.key);
        return { idx, idx2 };
      }
    }
    return;
  }

  private removeAlbum(album: AlbumWithData) {
    const idx = this.albums.findIndex((a) => a.key === album.key);
    if (idx !== -1) {
      this.albums.splice(idx, 1);
      return idx;
    }
    return;
  }
  private updatedAlbum(album: AlbumWithData) {
    return this.movedAlbum(album, album);
  }

  albumAtIndex(index: number): AlbumWithData & { yearSep: string } {
    if (index >= this.albums.length) {
      throw new Error("out of bounds");
    }
    let yearSep = "";
    const kind = (album: AlbumWithData) => {
      return album.shortcut ? "Shortcut" : "Album";
    };
    const k = kind(this.albums[index]);
    if (index === 0) {
      yearSep = k;
    } else {
      if (k !== kind(this.albums[index - 1])) {
        yearSep = k;
      } else if (!this.albums[index].shortcut) {
        const year = this.albums[index].name.slice(0, 4);
        if (this.albums[index - 1].name.slice(0, 4) !== year) {
          yearSep = year;
        }
      }
    }
    return { ...this.albums[index], yearSep };
  }

  albumIndexFromKey(key: string): number {
    return this.albums.findIndex((f) => f.key === key);
  }

  length(): number {
    return this.albums.length;
  }

  private sortFolders() {
    this.albums = this.allAlbums.filter(a => this.filter === null ? true : albumInFilter(a, this.filter));
    sortByKey(
      this.albums,
      ["shortcut", "name"],
      [false, this.sort.includes("Reverse")]
    );
  }

  private albums: AlbumWithData[];
  private allAlbums: AlbumWithData[];
  private filter: string | null;
  public shortcuts: { [shortcut: string]: Album };
  public emitter: Emitter<AlbumListEvent>;
  private sort: AlbumSortOrder;
  private unreg: Function | undefined;
}
