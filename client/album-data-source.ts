import { buildEmitter, Emitter } from "../shared/lib/event";
import { debounced, groupBy, range, sortByKey } from "../shared/lib/utils";
import {
  Album,
  AlbumChangeEvent,
  AlbumWithData,
  Node,
} from "../shared/types/types";
import { t } from "./components/strings";
import { getService } from "./rpc/connect";
import { AlbumListEvent } from "./uiTypes";
import { getSettingsEmitter, getSettings, isFilterEmpty } from "./lib/settings";
import { events } from "../shared/server-events";
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

  async fetchAllAlbums(filters?: any): Promise<AlbumWithData[]> {
    const s = await getService();
    // Fetch folders, projects, and person albums separately
    const folders = await s.folders(filters);
    const projects = await s.getProjectAlbums();
    const persons = await s.getPersonAlbums();
    return [...folders, ...projects, ...persons];
  }

  private compareAlbums(oldAlbums: AlbumWithData[], newAlbums: AlbumWithData[]): {
    added: AlbumWithData[];
    removed: AlbumWithData[];
    updated: { from: AlbumWithData; to: AlbumWithData }[];
  } {
    const oldMap = new Map(oldAlbums.map(a => [a.key, a]));
    const newMap = new Map(newAlbums.map(a => [a.key, a]));
    
    const added: AlbumWithData[] = [];
    const removed: AlbumWithData[] = [];
    const updated: { from: AlbumWithData; to: AlbumWithData }[] = [];
    
    // Find added albums
    for (const album of newAlbums) {
      if (!oldMap.has(album.key)) {
        added.push(album);
      } else {
        const oldAlbum = oldMap.get(album.key)!;
        // Check if count changed or other properties changed
        if (oldAlbum.count !== album.count || oldAlbum.name !== album.name || oldAlbum.shortcut !== album.shortcut) {
          updated.push({ from: oldAlbum, to: album });
        }
      }
    }
    
    // Find removed albums
    for (const album of oldAlbums) {
      if (!newMap.has(album.key)) {
        removed.push(album);
      }
    }
    
    return { added, removed, updated };
  }

  async refreshAlbums() {
    const s = await getService();
    const settings = getSettings();
    const newAlbums = await this.fetchAllAlbums(isFilterEmpty(settings.filters));
    const { added, removed, updated } = this.compareAlbums(this.allAlbums, newAlbums);
    
    if (added.length > 0 || removed.length > 0 || updated.length > 0) {
      // Store old sorted albums before updating
      const oldSortedAlbums = [...this.albums];
      
      this.allAlbums = newAlbums.map((a) => ({
        ...a,
        indent: 0,
        collapsed: false,
        head: [] as AlbumWithData[],
      }));
      this.sortFolders();
      
      const invalidations: number[] = [];
      
      // Handle removed albums - find their old indices
      for (const removedAlbum of removed) {
        const oldIdx = oldSortedAlbums.findIndex(a => a.key === removedAlbum.key);
        if (oldIdx !== -1) {
          invalidations.push(oldIdx);
        }
      }
      
      // Handle added albums - find their new indices
      for (const addedAlbum of added) {
        const newIdx = this.albums.findIndex(a => a.key === addedAlbum.key);
        if (newIdx !== -1) {
          invalidations.push(newIdx);
        }
      }
      
      // Handle updated albums
      for (const update of updated) {
        const oldIdx = oldSortedAlbums.findIndex(a => a.key === update.from.key);
        const newIdx = this.albums.findIndex(a => a.key === update.to.key);
        if (oldIdx !== -1) {
          invalidations.push(oldIdx);
        }
        if (newIdx !== -1 && newIdx !== oldIdx) {
          invalidations.push(newIdx);
        }
      }
      
      if (invalidations.length > 0) {
        const min = Math.min(...invalidations);
        const max = Math.max(...invalidations);
        
        if (max - min <= 10 && invalidations.length <= 10) {
          // Small number of changes, invalidate specific indices
          for (const index of invalidations) {
            this.emitter.emit("invalidateAt", { index });
          }
        } else if (min === 0 && max === this.albums.length - 1) {
          // All albums changed, reset
          this.emitter.emit("reset", {});
        } else {
          // Large range changed, invalidate the whole range
          this.emitter.emit("invalidateFrom", { index: min, to: max });
        }
      } else if (added.length > 0 || removed.length > 0) {
        // If we have adds/removes but couldn't find indices, reset
        this.emitter.emit("reset", {});
      }
    }
  }

  async init() {
    const s = await getService();
    this.shortcuts = await s.getShortcuts();

    // Listen for search setting changes
    getSettingsEmitter().on("changed", async (event) => {
      if (event.field === "filters.text") {
        await this.refreshAlbums();
      }
    });

    // Initial fetch
    const settings = getSettings();
    const initialAlbums = await this.fetchAllAlbums(isFilterEmpty(settings.filters));
    this.allAlbums = initialAlbums.map((a) => ({
      ...a,
      indent: 0,
      collapsed: false,
      head: [] as AlbumWithData[],
    }));
    this.sortFolders();
    this.emitter.emit("reset", {});

    // Listen to server events for album changes
    this.shortcutsUnreg = events.on("shortcutsUpdated", async () => {
      this.shortcuts = await s.getShortcuts();
      await this.refreshAlbums();
    });

    // Listen to albumAdded, albumRemoved, albumUpdated events
    this.albumAddedUnreg = events.on("albumAdded", async () => {
      await this.refreshAlbums();
    });

    this.albumRemovedUnreg = events.on("albumRemoved", async () => {
      await this.refreshAlbums();
    });

    this.albumUpdatedUnreg = events.on("albumUpdated", async () => {
      await this.refreshAlbums();
    });

    this.projectsUpdatedUnreg = events.on("projectsUpdated", async () => {
      await this.refreshAlbums();
    });
  }
  async destroy() {
    if (this.unreg) this.unreg();
    if (this.shortcutsUnreg) this.shortcutsUnreg();
    if (this.albumAddedUnreg) this.albumAddedUnreg();
    if (this.albumRemovedUnreg) this.albumRemovedUnreg();
    if (this.albumUpdatedUnreg) this.albumUpdatedUnreg();
    if (this.projectsUpdatedUnreg) this.projectsUpdatedUnreg();
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
    // Albums are now only folders
    const folders = albumsFromServer;
    sortByKey(folders, ["name"], ["alpha"]);
    folders.reverse();

    const shortcuts = folders.filter((a) => a.shortcut).map((f) => ({ ...f }));
    sortByKey(shortcuts, ["name"], ["alpha"]);

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
  private albumAddedUnreg: Function | undefined;
  private albumRemovedUnreg: Function | undefined;
  private albumUpdatedUnreg: Function | undefined;
  private projectsUpdatedUnreg: Function | undefined;
}
