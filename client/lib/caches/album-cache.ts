import { buildEmitter, Emitter } from "../../../shared/lib/event";
import { Album, AlbumWithData } from "../../../shared/types/types";
import { getService } from "../../rpc/connect";
import { getSettings, isFilterEmpty } from "../settings";
import { events as serverEvents } from "../../../shared/server-events";

export type AlbumCacheEvent = {
  albumsChanged: { albums: AlbumWithData[] };
  albumUpdated: { album: AlbumWithData };
  albumAdded: { album: AlbumWithData };
  albumRemoved: { album: Album };
};

export class AlbumCache {
  private albums: AlbumWithData[] = [];
  public readonly emitter: Emitter<AlbumCacheEvent>;

  constructor() {
    this.emitter = buildEmitter<AlbumCacheEvent>();
  }

  async init() {
    await this.refreshAlbums();
    this.setupEventListeners();
  }

  private setupEventListeners() {
    serverEvents.on("albumAdded", async (album: AlbumWithData) => {
      await this.refreshAlbums();
      this.emitter.emit("albumAdded", { album });
    });

    serverEvents.on("albumRemoved", async (album: Album) => {
      await this.refreshAlbums();
      this.emitter.emit("albumRemoved", { album });
    });

    serverEvents.on("albumUpdated", async (album: AlbumWithData) => {
      await this.refreshAlbums();
      this.emitter.emit("albumUpdated", { album });
    });

    // Listen to settings changes for filters
    const { getSettingsEmitter } = require("../settings");
    const settingsEmitter = getSettingsEmitter();
    settingsEmitter.on("changed", async (event: any) => {
      if (event.field === "filters.text") {
        await this.refreshAlbums();
      }
    });
  }

  async refreshAlbums() {
    const s = await getService();
    const settings = getSettings();
    const filters = isFilterEmpty(settings.filters) ? undefined : settings.filters;

    // Fetch folders (these already include shortcut info if applicable)
    const folders = await s.folders(filters);

    // Albums now only include folders (persons and projects are handled separately)
    this.albums = folders;
    this.emitter.emit("albumsChanged", { albums: this.albums });
  }

  getAlbums(): AlbumWithData[] {
    return [...this.albums];
  }

  albumAtIndex(index: number): AlbumWithData {
    if (index < 0 || index >= this.albums.length) {
      throw new Error(`Index ${index} out of bounds (length: ${this.albums.length})`);
    }
    return this.albums[index];
  }

  albumIndexFromKey(key: string): number {
    const idx = this.albums.findIndex((a) => a.key === key);
    if (idx === -1) {
      throw new Error(`Album with key ${key} not found`);
    }
    return idx;
  }

  length(): number {
    return this.albums.length;
  }
}

// Singleton instance
let cacheInstance: AlbumCache | undefined;

export function getAlbumCache(): AlbumCache {
  if (!cacheInstance) {
    cacheInstance = new AlbumCache();
  }
  return cacheInstance;
}
