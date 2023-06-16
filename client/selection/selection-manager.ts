import { buildEmitter, Emitter } from "../../shared/lib/event";
import { AlbumEntry } from "../../shared/types/types";

export type SelectionEvent<T> = {
  added: { key: T; selection: T[] };
  removed: { key: T; selection: T[] };
};

export type AlbumEntrySelectionManager = SelectionManager<AlbumEntry>;
export type AlbumEntrySelectionEventSource = Emitter<
  SelectionEvent<AlbumEntry>
>;
export class SelectionManager<T> {
  constructor(
    selection: T[] = [],
    idFct: (e: T) => string = (e) => JSON.stringify(e)
  ) {
    this._selection = [...selection];
    this._idFct = idFct;
    this._debounce = 0;
    this.events = buildEmitter<SelectionEvent<T>>(false);
  }
  isSelected(key: T): boolean {
    return (
      this._selection.findIndex((e) => this._idFct(e) === this._idFct(key)) !==
      -1
    );
  }
  selected(): T[] {
    return Array.from(this._selection);
  }
  select(key: T) {
    this._debounce = new Date().getTime();
    if (!this.isSelected(key)) {
      this._selection.push(key);
      this.events.emit("added", {
        key,
        selection: this._selection,
      });
    }
  }
  setSelection(keys: T[]) {
    this._selection.splice(0, this._selection.length, ...keys);
  }
  toggle(key: T) {
    this._debounce = new Date().getTime();
    if (!this.isSelected(key)) {
      this.select(key);
    } else {
      this.deselect(key);
    }
  }
  deselect(key: T) {
    this._debounce = new Date().getTime();
    if (this.isSelected(key)) {
      this._selection.splice(
        this._selection.findIndex((e) => this._idFct(e) === this._idFct(key)),
        1
      );
      this.events.emit("removed", {
        key,
        selection: this._selection,
      });
    } else debugger;
  }

  clear() {
    if (this._debounce + 500 > new Date().getTime()) {
      //debugger;
      //return;
    }
    let l;
    while ((l = this.last())) {
      this.deselect(l);
    }
  }
  last(): T | undefined {
    return this._selection[this._selection.length - 1];
  }

  events: Emitter<SelectionEvent<T>>;
  private _idFct: (e: T) => string;
  private _selection: T[];
  private _debounce: number;
}
