import { buildEmitter, Emitter } from "../shared/lib/event";
import {
  albumInFilter,
  debounce,
  debounced,
  removeDiacritics,
  sortByKey,
} from "../shared/lib/utils";
import {
  Album,
  AlbumChangeEvent,
  AlbumEntry,
  AlbumKind,
  AlbumWithData,
} from "../shared/types/types";
import { t } from "./components/strings";
import { getService } from "./rpc/connect";
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
    let invalidations: any[] = [];

    const resolveAndInvalidate = debounced(() => {
      if (invalidations.length > 0) {
        const filtered = invalidations.filter(
          (v) => v !== undefined
        ) as number[];
        if (filtered.length > 0) {
          const min = Math.min(...filtered);
          const max = Math.max(...filtered);
          if (min === max) {
            this.emitter.emit("invalidateAt", { index: min });
          } else {
            console.warn(`Invalidating from ${min} / ${max}`);
            this.emitter.emit("invalidateFrom", {
              index: min,
              to: max,
            });
          }
        }
        invalidations = [];
      }
    });
    return new Promise<void>((resolve) => {
      s.monitorAlbums();
      let gotEvent = false;

      s.on("shortcutsUpdated", async () => {
        this.shortcuts = await s.getShortcuts();
        invalidations.push(0);
        invalidations.push(10);
        resolveAndInvalidate();
      });
      this.unreg = s.on("albumEvent", async (e: any) => {
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
                invalidations.push(0);
                invalidations.push(this.albums.length - 1);
                resolve();
              }
              break;
            case "albumDeleted":
              invalidations.push(this.removeAlbum(event.album!));
              invalidations.push(this.albums.length - 1);
              break;
            case "albumInfoUpdated":
              {
                const up = this.updatedAlbum(event.album!);
                if (up) {
                  invalidations.push(up.idx);
                  invalidations.push(up.idx2);
                }
              }
              break;
            case "albumOrderUpdated":
              const index = this.albumIndexFromKey(event.album!.key);
              invalidations.push(index);
              break;
            case "albumMoved":
              {
                const up = this.movedAlbum(event.album!, event.altAlbum!);
                if (up) {
                  invalidations.push(up.idx);
                  invalidations.push(up.idx2);
                }
              }
              break;
            case "albumAdded":
              invalidations.push(this.addAlbum(event.album!));
              invalidations.push(this.albums.length - 1);
          }
        }
        resolveAndInvalidate();
      });
    });
  }
  async destroy() {
    if (this.unreg) this.unreg();
  }

  async setFilter(filter: string) {
    this.filter = removeDiacritics(filter.toLowerCase());
    this.sortFolders();
    this.emitter.emit("invalidateFrom", {
      index: 0,
      to: this.albums.length - 1,
    });
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
      let idx = this.albums.findIndex((a) => a.key === from.key);
      this.allAlbums.splice(idxAll, 1);
      this.allAlbums.push(to);
      this.sortFolders();
      if (idx !== -1) {
        let idx2 = this.albums.findIndex((a) => a.key === to.key);
        // Moving to an album that now has a head, we must refresh the one before it too
        if (this.albumAtIndex(idx2).head && idx2 > 0 && idx2 !== idx) {
          idx2--;
        }
        if (
          this.albumAtIndex(idx).head &&
          idx < this.albums.length - 1 &&
          idx !== idx2
        ) {
          // Moving an album that had a head, we must refresh the one after it too
          idx++;
        }
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

  albumAtIndex(index: number): AlbumWithData & { head: string } {
    if (index >= this.albums.length) {
      throw new Error("out of bounds");
    }
    let head = "";
    const album = this.albums[index];
    const k = album.kind;
    if (index === 0) {
      head = album.shortcut ? t("shortcut") : t(k);
    } else {
      if (
        k !== this.albums[index - 1].kind ||
        !!album.shortcut !== !!this.albums[index - 1].shortcut
      ) {
        // New kind
        head = album.shortcut ? t("shortcut") : t(k);
      } else if (k === AlbumKind.FACE) {
        // face album don't have separators
        head = "";
      } else if (k === AlbumKind.FOLDER) {
        if (album.shortcut) {
          // shortcuts don't have separators
          head = "";
        } else {
          // folders are separated by year
          const year = this.albums[index].name.slice(0, 4);
          if (this.albums[index - 1].name.slice(0, 4) !== year) {
            head = year;
          }
        }
      }
    }
    return { ...this.albums[index], head };
  }

  albumIndexFromKey(key: string): number {
    const idx = this.albums.findIndex((f) => f.key === key);
    if (idx === -1) {
      throw new Error("Unknown album key");
    }
    return idx;
  }

  length(): number {
    return this.albums.length;
  }

  private sortFolders() {
    this.albums = this.allAlbums.filter((a) =>
      this.filter === null ? true : albumInFilter(a, this.filter)
    );
    sortByKey(
      this.albums,
      ["kind", "shortcut", "name"],
      [
        [AlbumKind.PROJECT, AlbumKind.FOLDER, AlbumKind.FACE],
        "alpha",
        this.sort.includes("Reverse") ? "reverse" : "alpha",
      ]
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
