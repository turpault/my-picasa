import { buildEmitter, Emitter } from "../../shared/lib/event.js";
import { AlbumEntry } from "../types/types.js";

export type SelectionEvent = {
  added: { key: AlbumEntry; selection: AlbumEntry[] };
  removed: { key: AlbumEntry; selection: AlbumEntry[] };
};

export type SelectionEventSource = Emitter<SelectionEvent>;

let singleton: SelectionManager;
export class SelectionManager {
  static get(): SelectionManager {
    if (!singleton) {
      singleton = new SelectionManager();
    }
    return singleton;
  }
  private constructor() {
    this._selection = [];
    this.events = buildEmitter<SelectionEvent>();
  }
  isSelected(key: AlbumEntry): boolean {
    return (
      this._selection.findIndex(
        (e) => e.album.key === key.album.key && e.name === key.name
      ) !== -1
    );
  }
  selected(): AlbumEntry[] {
    return Array.from(this._selection);
  }
  select(key: AlbumEntry) {
    if (!this.isSelected(key)) {
      this._selection.push(key);
      this.events.emit("added", {
        key,
        selection: this._selection,
      });
    }
  }
  deselect(key: AlbumEntry) {
    if (this.isSelected(key)) {
      this._selection.splice(
        this._selection.findIndex(
          (e) => e.album.key === key.album.key && e.name === key.name
        ),
        1
      );
      this.events.emit("removed", {
        key,
        selection: this._selection,
      });
    } else debugger;
  }

  clear() {
    let l;
    while ((l = this.last())) {
      this.deselect(l);
    }
  }
  last(): AlbumEntry | undefined {
    return this._selection[this._selection.length - 1];
  }

  events: Emitter<SelectionEvent>;
  private _selection: AlbumEntry[];
}
