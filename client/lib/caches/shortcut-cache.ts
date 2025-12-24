import { buildEmitter, Emitter } from "../../../shared/lib/event";
import { Shortcut } from "../../../shared/types/types";
import { getService } from "../../rpc/connect";
import { events as serverEvents } from "../../../shared/server-events";

export type ShortcutCacheEvent = {
  shortcutsChanged: { shortcuts: Shortcut[] };
};

export class ShortcutCache {
  private shortcuts: Shortcut[] = [];
  public readonly emitter: Emitter<ShortcutCacheEvent>;

  constructor() {
    this.emitter = buildEmitter<ShortcutCacheEvent>();
  }

  async init() {
    await this.refresh();
    this.setupEventListeners();
  }

  private setupEventListeners() {
    serverEvents.on("shortcutsUpdated", async () => {
      await this.refresh();
    });
  }

  async refresh() {
    const s = await getService();
    this.shortcuts = await s.getShortcuts();
    this.emitter.emit("shortcutsChanged", { shortcuts: this.shortcuts });
  }

  getShortcuts(): Shortcut[] {
    return [...this.shortcuts];
  }
}

let cacheInstance: ShortcutCache | undefined;

export function getShortcutCache(): ShortcutCache {
  if (!cacheInstance) {
    cacheInstance = new ShortcutCache();
  }
  return cacheInstance;
}
