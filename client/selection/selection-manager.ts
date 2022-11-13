import { buildEmitter, Emitter } from "../../shared/lib/event";
import { AlbumEntry } from "../../shared/types/types";

export type SelectionEvent = {
  added: { key: AlbumEntry; selection: AlbumEntry[] };
  removed: { key: AlbumEntry; selection: AlbumEntry[] };
};

export type SelectionEventSource = Emitter<SelectionEvent>;
export class SelectionManager {
  constructor(selection: AlbumEntry[] = []) {
    this._selection = selection;
    this._debounce = 0;
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
    this._debounce = new Date().getTime();
    if (!this.isSelected(key)) {
      this._selection.push(key);
      this.events.emit("added", {
        key,
        selection: this._selection,
      });
    }
  }
  toggle(key: AlbumEntry) {
    this._debounce = new Date().getTime();
    if (!this.isSelected(key)) {
      this.select(key);
    } else {
      this.deselect(key);
    }
  }
  deselect(key: AlbumEntry) {
    this._debounce = new Date().getTime();
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
    if (this._debounce + 500 > new Date().getTime()) 
    {
      //debugger;
      //return;
    }
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
  private _debounce: number;
}
