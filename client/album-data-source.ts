import { buildEmitter, Emitter } from "../shared/lib/event";
import { debounced, groupBy, range, sortByKey } from "../shared/lib/utils";
import {
  Album,
  AlbumChangeEvent,
  AlbumKind,
  AlbumWithData,
  Node,
} from "../shared/types/types";
import { t } from "./components/strings";
import { getService } from "./rpc/connect";
import { AlbumListEvent } from "./uiTypes";
import { getSettingsEmitter, getSettings } from "./lib/settings";
function firstAlbum(node: Node): AlbumWithData | undefined {
  if (node.albums.length > 0) return node.albums[0];
  if (node.childs) {
    for (const child of Object.values(node.childs)) {
      const a = firstAlbum(child);
      if (a) return a;
    }
  }
  return undefined;
}
function lastAlbum(node: Node): AlbumWithData | undefined {
  if (node.albums.length > 0) return node.albums[node.albums.length - 1];
  if (node.childs) {
    for (const child of Object.values(node.childs).reverse()) {
      const a = lastAlbum(child);
      if (a) return a;
    }
  }
  return undefined;
}
function allAlbums(node: Node): AlbumWithData[] {
  return [...node.albums, ...Object.values(node.childs).map(allAlbums).flat()];
}

export type AlbumSortOrder = "ReverseDate" | "ForwardDate";
export class AlbumIndexedDataSource {
  constructor() {
    this.albums = [];
    this.allAlbums = [];
    this.shortcuts = {};
    const albumEmitter = buildEmitter<AlbumListEvent>();
    this.emitter = albumEmitter;
  }

  async init() {
    const s = await getService();
    this.shortcuts = await s.getShortcuts();
    let invalidations: any[] = [];
    let gotFirstAlbumEvent = false;

    // Listen for search setting changes
    getSettingsEmitter().on("changed", (event) => {
      if (event.field === "filters.text") {
        // Invalidate all albums when search changes
        this.emitter.emit("reset", {});
        gotFirstAlbumEvent = false;
        // Call monitorAlbums with the new search filter
        s.monitorAlbums(event.filters.text);
      }
    });

    const resolveAndInvalidate = debounced(() => {
      if (invalidations.length > 0) {
        const filtered = invalidations.filter(
          (v) => v !== undefined,
        ) as number[];
        if (filtered.length > 0) {
          const min = Math.min(...filtered);
          const max = Math.max(...filtered);
          // Less than 10 albums changed, just invalidate them
          if (max - min <= 10) {
            for (const index of range(min, max)) {
              this.emitter.emit("invalidateAt", {
                index,
              });
            }
          } else if (min === 0 && max === this.albums.length - 1) {
            // All albums changed, reset
            this.emitter.emit("reset", {});
          } else {
            // More than 10 albums changed, invalidate the whole range
            console.warn(`Invalidating from ${min} / ${max}`);
            this.emitter.emit("invalidateFrom", {
              index: min,
              to: max,
            });
          }
        }
        invalidations = [];
      }
    }, 100);
    return new Promise<void>((resolve) => {
      // Call monitorAlbums with current search setting
      const settings = getSettings();
      s.monitorAlbums(settings.filters.text);

      this.shortcutsUnreg = s.on("shortcutsUpdated", async () => {
        this.shortcuts = await s.getShortcuts();
        if (gotFirstAlbumEvent) {
          invalidations.push(0);
          invalidations.push(10);
          resolveAndInvalidate();
        }
      });
      this.unreg = s.on("albumEvent", async (e: any) => {
        for (const event of e.payload as AlbumChangeEvent[]) {
          if (!gotFirstAlbumEvent && event.type !== "albums") {
            continue;
          }
          console.log("Got event", event.type, ";", event.album?.name);
          switch (event.type) {
            case "albums":
              {
                gotFirstAlbumEvent = true;
                this.allAlbums = event.albums!.map((a) => ({
                  ...a,
                  indent: 0,
                  collapsed: false,
                  head: [] as AlbumWithData[],
                }));
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
                const up = this.updatedAlbum(event.album!, event.album!);
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
            case "albumRenamed":
              {
                this.emitter.emit("renamed", {
                  album: event.album!,
                  oldAlbum: event.altAlbum!,
                });
                const res = this.updatedAlbum(event.altAlbum, event.album);
                if (res.idx === res.idx2) {
                  // No order change, ignore
                } else {
                  invalidations.push(res.idx);
                  invalidations.push(res.idx2);
                }
              }
              break;
            case "albumAdded":
              const albumIndex = this.addAlbum(event.album!);
              if (albumIndex !== -1) {
                invalidations.push(albumIndex);
                invalidations.push(this.albums.length - 1);
              }
          }
        }
        resolveAndInvalidate();
      });
    });
  }
  async destroy() {
    if (this.unreg) this.unreg();
    if (this.shortcutsUnreg) this.shortcutsUnreg();
  }

  private addAlbum(album: AlbumWithData) {
    // Find at which index the album should be added
    let index = this.allAlbums.findIndex((a) => a.key === album.key);
    if (index !== -1) {
      return -1;
    }
    this.allAlbums.push({ ...album });
    this.sortFolders();
    // find where the album is, and invalidate from that point
    index = this.albums.findIndex((a) => a.key === album.key);
    if (index === -1) {
      throw new Error("Album not found");
    }
    return index;
  }

  private removeAlbum(album: AlbumWithData) {
    const idx = this.albums.findIndex((a) => a.key === album.key);
    if (idx !== -1) {
      this.albums.splice(idx, 1);
      return idx;
    }
    return 0;
  }
  private updatedAlbum(from: AlbumWithData, to: AlbumWithData) {
    const idxAll = this.allAlbums.findIndex((a) => a.key === from.key);
    const idx = this.albums.findIndex((a) => a.key === from.key);
    if (idxAll !== -1) {
      this.allAlbums[idxAll] = { ...this.allAlbums[idxAll], ...to };
      this.sortFolders();
      const idx2 = this.albums.findIndex((a) => a.key === to.key);
      if (idx2 !== -1) {
        return { idx: idx !== -1 ? idx : 0, idx2 };
      }
    }
    return { idx: 0, idx2: 0 };
  }

  toggleCollapse(node: Node) {
    if (node.childs.length !== 0) {
      const invalidateBounds = {
        index: Number.MAX_SAFE_INTEGER,
        to: 0,
      };

      node.childs.forEach((n) => {
        n.collapsed = !n.collapsed;
        const first = firstAlbum(n);
        const last = lastAlbum(n);
        if (first) {
          invalidateBounds.index = Math.min(
            invalidateBounds.index,
            this.albumIndex(first),
          );
        }
        if (last) {
          invalidateBounds.to = Math.max(
            invalidateBounds.to,
            this.albumIndex(last),
          );
        }
        this.emitter.emit("nodeCollapsed", { node: n });
      });
      //this.emitter.emit("invalidateFrom", invalidateBounds);
      return;
    }
    node.collapsed = !node.collapsed;
    /*this.emitter.emit("invalidateFrom", {
      index: this.albumIndex(firstAlbum(node)!),
      to: this.albumIndex(lastAlbum(node)!),
    });*/
    this.emitter.emit("nodeCollapsed", { node });
  }

  isCollapsed(
    album: AlbumWithData,
    node: Node = this.hierarchy,
  ): boolean | undefined {
    if (node.albums.find((a) => a.key === album.key)) {
      return node.collapsed;
    }
    if (node.childs) {
      for (const child of Object.values(node.childs)) {
        const c = this.isCollapsed(album, child);
        if (c !== undefined) {
          return node.collapsed;
        }
      }
    }
    return undefined;
  }

  albumAtIndex(index: number): AlbumWithData {
    if (index >= this.albums.length) {
      debugger;
      throw new Error("out of bounds");
    }
    if (!this.albums[index]) debugger;
    return this.albums[index];
  }

  albumIndexFromKey(key: string): number {
    const idx = this.albums.findIndex((f) => f.key === key);
    if (idx === -1) {
      throw new Error("Unknown album key");
    }
    return idx;
  }

  albumIndex(album: Album): number {
    const idx = this.albums.findIndex((f) => f.key === album.key);
    if (idx === -1) {
      throw new Error("Unknown album key");
    }
    return idx;
  }

  length(): number {
    return this.albums.length;
  }

  private sortFolders() {
    const sorted = this.sortAlbums(this.allAlbums);
    this.hierarchy = sorted.node;
    this.albums = sorted.albums;
  }

  private sortAlbums(albumsFromServer: AlbumWithData[]): {
    node: Node;
    albums: AlbumWithData[];
  } {
    const filteredAlbums = albumsFromServer;
    const groups = groupBy(filteredAlbums, "kind");

    let folders = groups.get(AlbumKind.FOLDER)!;
    sortByKey(folders, ["name"], ["alpha"]);
    folders.reverse();

    const shortcuts = folders.filter((a) => a.shortcut).map((f) => ({ ...f }));
    sortByKey(shortcuts, ["name"], ["alpha"]);

    const faces = groups.get(AlbumKind.FACE) || [];
    const projects = groups.get(AlbumKind.PROJECT) || [];
    sortByKey(faces, ["name"], ["alpha"]);

    const foldersByYear = groupBy(folders, "name", (n: string) =>
      n.slice(0, 4),
    );
    const hierarchy: Node = {
      name: "",
      collapsed: false,
      albums: [] as AlbumWithData[],
      childs: [
        {
          name: t("shortcuts"),
          collapsed: false,
          albums: shortcuts,
          childs: [] as Node[],
        },
        {
          name: t("projects"),
          collapsed: false,
          albums: projects,
          childs: [] as Node[],
        },
        {
          name: t("folders"),
          albums: [] as AlbumWithData[],
          collapsed: false,
          childs: Array.from(foldersByYear.keys()).map((key) => ({
            name: key,
            collapsed: false,
            albums: foldersByYear.get(key)!,
            childs: [] as Node[],
          })),
        },
        {
          name: t("faces"),
          collapsed: false,
          albums: faces,
          childs: [] as Node[],
        },
      ],
    };
    const albums = allAlbums(hierarchy);
    return { node: hierarchy, albums };
  }

  getHierarchy(): Node {
    return this.hierarchy;
  }

  private albums: AlbumWithData[];
  private hierarchy: Node = {
    collapsed: false,
    albums: [],
    name: "",
    childs: [],
  };
  private allAlbums: AlbumWithData[];
  public shortcuts: { [shortcut: string]: Album };
  public emitter: Emitter<AlbumListEvent>;
  private unreg: Function | undefined;
  private shortcutsUnreg: Function | undefined;
}
