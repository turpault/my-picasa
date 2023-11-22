import { buildEmitter, Emitter } from "../../shared/lib/event";
import { AlbumEntry } from "../../shared/types/types";

export type SelectionEvent<T> = {
  added: { key: T; selection: T[] };
  activeChanged: { index: number; key: T; selection: T[] };
  removed: { key: T; selection: T[] };
  pinned: { key: T; pinned: boolean };
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
    this.events = buildEmitter<SelectionEvent<T>>(false);
  }
  active(): T {
    return this._selection[this._active];
  }
  setActiveIndex(newIndex: number): number {
    this._active = newIndex;
    this.events.emit("activeChanged", {
      index: this._active,
      key: this._selection[this._active],
      selection: this._selection,
    });
    return this._active;
  }

  activeIndex(): number {
    return this._active;
  }
  isSelected(key: T): boolean {
    return (
      this._selection.findIndex((e) => this._idFct(e) === this._idFct(key)) !==
      -1
    );
  }
  isPinned(key: T): boolean {
    const t = this._selection.find((e) => this._idFct(e) === this._idFct(key));
    return t && !!t.pinned;
  }
  selected(): T[] {
    return Array.from(this._selection);
  }
  select(key: T) {
    if (!this.isSelected(key)) {
      this._selection.push(key);
      this.events.emit("added", {
        key,
        selection: this._selection,
      });
      this.setActiveIndex(this._selection.length - 1);
    }
  }

  setActiveNext() {
    this.setActiveIndex((this.activeIndex() + 1) % this.selected().length);
  }

  setActivePrevious() {
    this.setActiveIndex(
      (this.activeIndex() - 1 + this.selected().length) % this.selected().length
    );
  }
  setSelection(keys: T[]) {
    this.clear();
    for (const k of keys) {
      this.select(k);
    }
    this.setActiveIndex(this._selection.length - 1);
  }

  setPin(key: T, pinned: boolean) {
    const t = this._selection.find((e) => this._idFct(e) === this._idFct(key));
    if (t && !!t.pinned != pinned) {
      t.pinned = pinned;
      this.events.emit("pinned", { key, pinned });
    }
  }
  getPinned() {
    return this._selection.filter((e) => e.pinned);
  }

  toggle(key: T) {
    if (!this.isSelected(key)) {
      this.select(key);
    } else {
      this.deselect(key);
    }
  }
  deselect(key: T) {
    if (this.isSelected(key)) {
      const idx = this._selection.findIndex(
        (e) => this._idFct(e) === this._idFct(key)
      );
      if (idx === this.activeIndex() && this.selected().length > 1) {
        this.setActiveNext();
      } else {
        this.setActiveIndex(-1);
      }
      this._selection.splice(idx, 1);
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
  last(): T | undefined {
    return this._selection[this._selection.length - 1];
  }

  events: Emitter<SelectionEvent<T>>;
  private _idFct: (e: T) => string;
  private _selection: (T & { pinned?: boolean })[];
  private _active = -1;
}
