import { buildEmitter, Emitter } from "../../shared/lib/event";
import { AlbumEntry } from "../../shared/types/types";
import { t } from "../components/strings";

export type SelectionEvent<T> = {
  changed: { added: T[]; removed: T[]; current: T[]; pinned: T[] };
  activeChanged: { index: number; key: T; selection: T[] };
};

export type AlbumEntrySelectionManager = SelectionManager<AlbumEntry>;
export type AlbumEntrySelectionEventSource = Emitter<
  SelectionEvent<AlbumEntry>
>;
export class SelectionManager<T> {
  constructor(
    selection: T[] = [],
    idFct: (e: T) => string = (e) => JSON.stringify(e),
  ) {
    this._selection = [...selection];
    this._idFct = idFct;
    this.events = buildEmitter<SelectionEvent<T>>(false);
  }
  clone(): SelectionManager<T> {
    const c = new SelectionManager<T>(this._selection, this._idFct);
    c.setActive(this._active);
    return c;
  }
  active(): T {
    return this._active;
  }
  setActiveIndex(newIndex: number): number {
    const newActive = this._selection[newIndex];
    if (newActive !== this._active) {
      this.update(this._selection, newActive);
    }
    return this.activeIndex();
  }
  private indexOf(list: T[], key: T): number {
    return list.findIndex((e) => this._idFct(e) === this._idFct(key));
  }
  setActive(key: T) {
    if (key) {
      const idx = this.indexOf(this._selection, key);
      this.setActiveIndex(idx);
    } else {
      this.setActiveIndex(-1);
    }
  }

  activeIndex(): number {
    if (!this._active) return -1;
    return this.indexOf(this._selection, this._active);
  }
  isSelected(key: T): boolean {
    return this.indexOf(this._selection, key) !== -1;
  }
  isPinned(key: T): boolean {
    const t = this._selection[this.indexOf(this._selection, key)];
    return t && !!t.pinned;
  }
  selected(): T[] {
    return Array.from(this._selection);
  }
  select(key: T) {
    if (!this.isSelected(key)) {
      this.update([...this._selection, key], this._active);
    }
  }
  selectMultiple(keys: T[]) {
    // Concatenate the current selection with the new keys and ensure uniqueness
    const multiple = [...this._selection, ...keys].reduce((acc, cur) => {
      if (!acc.find((e) => this._idFct(e) === this._idFct(cur))) {
        acc.push(cur);
      }
      return acc;
    }, [] as T[]);
    this.update(multiple, this._active);
  }

  setActiveNext() {
    const index = this.activeIndex() + 1;
    if (index >= this._selection.length) return;
    this.update(this._selection, this._selection[index]);
  }

  setActivePrevious() {
    const index = this.activeIndex() - 1;
    if (index < 0) return;
    this.update(this._selection, this._selection[index]);
  }

  setPin(key: T, pinned: boolean) {
    const t = this._selection.find((e) => this._idFct(e) === this._idFct(key));
    if (t && !!t.pinned != pinned) {
      t.pinned = pinned;
      this.update(this._selection, this._active, true);
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
      let active = this._active;
      if (active && this._idFct(active) === this._idFct(key)) {
        if (this.selected().length > 1) {
          this.setActiveNext();
          active = this._active;
        } else {
          active = null;
        }
      }
      const idx = this._selection.findIndex(
        (e) => this._idFct(e) === this._idFct(key),
      );
      const newSelection = [...this._selection];
      newSelection.splice(idx, 1);
      this.update(newSelection, active);
    }
  }

  clear() {
    this.update([], undefined);
  }
  setSelection(keys: T[], active?: T) {
    this.update([...keys], active);
  }
  last(): T | undefined {
    return this._selection[this._selection.length - 1];
  }

  protected update(selection: T[], active?: T, pinningChange = false) {
    const lastActive = this.active();
    const added = selection.filter((v) => !this.isSelected(v));
    const removed: T[] = [];
    this._selection = [
      ...this._selection.filter((v) => {
        if (v.pinned) return true;
        if (selection.find((e) => this._idFct(e) === this._idFct(v)))
          return true;
        removed.push(v);
        return false;
      }),
      ...added,
    ];

    if (selection.length === 0 || active === null) {
      active = undefined;
    } else if (active !== undefined) {
      active = selection.find((e) => this._idFct(e) === this._idFct(active));
    } else {
      active = this._selection[0];
    }

    this._active = active;
    const newActive = this.active();
    const activeChanged = lastActive !== newActive;
    if (added.length !== 0 || removed.length !== 0 || pinningChange) {
      this.events.emit("changed", {
        added,
        removed,
        current: this._selection,
        pinned: this.getPinned(),
      });
    }
    if (activeChanged) {
      this.events.emit("activeChanged", {
        index: this.activeIndex(),
        key: this._active,
        selection: this._selection,
      });
    }
  }

  events: Emitter<SelectionEvent<T>>;
  private _idFct: (e: T) => string;
  private _selection: (T & { pinned?: boolean })[];
  private _active?: T;
}

export class SelectionManagerProxy<T> extends SelectionManager<T> {
  private off: Function | undefined;
  private target: SelectionManager<T>;
  constructor(idFct: (e: T) => string = (e) => JSON.stringify(e)) {
    super([], idFct);
  }

  updateManager(manager: SelectionManager<T>) {
    if (this.off) this.off();
    this.off = undefined;
    this.update(manager.selected(), manager.active());
    const pinned = manager.getPinned();
    this.selected().forEach((s) =>
      pinned.includes(s) ? this.setPin(s, true) : this.setPin(s, false),
    );
    const offFcts = [
      manager.events.on("changed", (e) => {
        this.update(manager.selected(), manager.active());
        this.selected().forEach((s) =>
          e.pinned.includes(s) ? this.setPin(s, true) : this.setPin(s, false),
        );
      }),
      manager.events.on("activeChanged", (e) => {
        this.setActive(e.key);
      }),
    ];
    this.off = () => offFcts.forEach((f) => f());
    this.target = manager;
  }
  setActiveIndex(newIndex: number): number {
    return this.target.setActiveIndex(newIndex);
  }
  setActive(key: T) {
    return this.target.setActive(key);
  }

  select(key: T) {
    return this.target.select(key);
  }
  selectMultiple(keys: T[]) {
    return this.target.selectMultiple(keys);
  }

  setActiveNext() {
    return this.target.setActiveNext();
  }

  setActivePrevious() {
    return this.target.setActivePrevious();
  }

  setPin(key: T, pinned: boolean) {
    return this.target.setPin(key, pinned);
  }

  toggle(key: T) {
    return this.target.toggle(key);
  }
  deselect(key: T) {
    return this.target.deselect(key);
  }
  setSelection(keys: T[], active?: T) {
    return this.target.setSelection(keys, active);
  }
  clear() {
    return this.target.clear();
  }
}
