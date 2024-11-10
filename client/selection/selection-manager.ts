import { buildEmitter, Emitter } from "../../shared/lib/event";
import { AlbumEntry } from "../../shared/types/types";
import { t } from "../components/strings";

export type SelectionEvent<T> = {
  changed: { added: T[]; removed: T[]; changedPinned: T[] };
  activeChanged: { index: number; key: T };
};

export type AlbumEntrySelectionManager = ISelectionManager<AlbumEntry>;
export type AlbumEntrySelectionEventSource = Emitter<
  SelectionEvent<AlbumEntry>
>;
type SelectionItem<T> = T & { pinned?: boolean; sortIndex: number };
export interface ISelectionManager<T> {
  setActiveIndex(newIndex: number): number;
  setActive(key: T): void;
  select(key: T): void;
  selectMultiple(keys: T[]): void;
  setActiveNext(): void;
  setActivePrevious(): void;
  setPin(key: T, pinned: boolean): void;
  toggle(key: T): void;
  deselect(key: T): void;
  setSelection(keys: T[], active?: T): void;
  clear(): void;
  clone(): SelectionManager<T>;
  active(): T;
  activeIndex(): number;
  isSelected(key: T): boolean;
  isPinned(key: T): boolean;
  selected(): T[];
  getPinned(): T[];
  last(): T | undefined;
  events: Emitter<SelectionEvent<T>>;
}

export class SelectionManager<T> implements ISelectionManager<T> {
  constructor(
    selection: T[] = [],
    idFct: (e: T) => string = (e) => JSON.stringify(e),
  ) {
    this._selection = new Map<string, SelectionItem<T>>(
      selection.map((e, index) => [idFct(e), { ...e, sortIndex: index }]),
    );
    this._idFct = idFct;
    this.events = buildEmitter<SelectionEvent<T>>(false);
  }
  clone(): SelectionManager<T> {
    const c = new SelectionManager<T>(
      Array.from(this._selection.values()),
      this._idFct,
    );
    c.setActive(this._active);
    return c;
  }
  active(): T {
    return this._active;
  }
  setActiveIndex(newIndex: number): number {
    const active = this.activeIndex();
    if (newIndex === active) return active;
    const newActive = Array.from(this._selection.values()).find(
      (e) => e.sortIndex === newIndex,
    );
    this.setActive(newActive);
    return newIndex;
  }

  realValueOf(key: T): SelectionItem<T> | undefined {
    const k = this._idFct(key);
    return this._selection.get(k);
  }
  setActive(key: T) {
    if (key) {
      const k = this.realValueOf(key);
      this._active = k;
      this.events.emit("activeChanged", {
        index: this.activeIndex(),
        key: this._active,
      });
    }
  }

  activeIndex(): number {
    if (!this._active) return -1;
    return this._active.sortIndex;
  }
  isSelected(key: T): boolean {
    return this._selection.has(this._idFct(key));
  }
  isPinned(key: T): boolean {
    const t = this.realValueOf(key);
    return t && !!t.pinned;
  }
  selected(): T[] {
    return Array.from(this._selection.values());
  }
  select(key: T) {
    if (!this.isSelected(key)) {
      this._selection.set(this._idFct(key), {
        ...key,
        sortIndex: this.sortIndex++,
      });
      this.events.emit("changed", {
        added: [key],
        removed: [],
        changedPinned: [],
      });
    }
  }
  selectMultiple(keys: T[]) {
    // Concatenate the current selection with the new keys and ensure uniqueness
    const added: T[] = [];
    for (const k of keys)
      if (!this.isSelected(k)) {
        this._selection.set(this._idFct(k), {
          ...k,
          sortIndex: this.sortIndex++,
        });
        added.push(k);
      }
    this.events.emit("changed", {
      added,
      removed: [],
      changedPinned: [],
    });
  }

  setActiveNext() {
    const index = this.activeIndex();
    const next = Array.from(this._selection.values()).find(
      (e) => e.sortIndex > index,
    );
    if (next) {
      this.setActive(next);
    }
  }

  setActivePrevious() {
    const index = this.activeIndex();
    const previous = Array.from(this._selection.values())
      .reverse()
      .find((e) => e.sortIndex < index);
    if (previous) {
      this.setActive(previous);
    }
  }

  setPin(key: T, pinned: boolean) {
    const k = this.realValueOf(key);

    if (k && !!k.pinned != pinned) {
      k.pinned = pinned;
      this.events.emit("changed", {
        added: [],
        removed: [],
        changedPinned: [k],
      });
    }
  }
  getPinned() {
    return Array.from(this._selection.values()).filter((e) => e.pinned);
  }

  toggle(key: T) {
    if (!this.isSelected(key)) {
      this.select(key);
    } else {
      this.deselect(key);
    }
  }

  deselect(key: T) {
    if (this.isSelected(key) && !this.isPinned(key)) {
      const k = this.realValueOf(key);
      if (this._active === k) {
        this.setActiveNext();
      }
      if (this._active === k) {
        this.setActive(null);
      }
      this._selection.delete(this._idFct(key));
      this.events.emit("changed", {
        added: [],
        removed: [key],
        changedPinned: [],
      });
    }
  }

  clear() {
    const removed: T[] = [];
    this._selection.forEach((v, k) => {
      if (v.pinned) return;
      removed.push(v);
      this._selection.delete(k);
      if (this._active === v) this._active = undefined;
    });
    this._active = undefined;
    this.events.emit("changed", {
      added: [],
      removed,
      changedPinned: [],
    });
  }
  setSelection(keys: T[], active?: T) {
    this.clear();
    const added: T[] = [];
    for (const k of keys) {
      if (this.isSelected(k)) continue;
      this._selection.set(this._idFct(k), {
        ...k,
        sortIndex: this.sortIndex++,
      });
      added.push(k);
    }
    this._active = this.realValueOf(active);
    this.events.emit("changed", {
      added,
      removed: [],
      changedPinned: [],
    });
    this.events.emit("activeChanged", {
      index: this.activeIndex(),
      key: this._active,
    });
  }
  last(): T | undefined {
    return Array.from(this._selection.values()).reduce(
      (acc, e) => (acc && acc.sortIndex > e.sortIndex ? acc : e),
      undefined,
    );
  }

  events: Emitter<SelectionEvent<T>>;
  private _idFct: (e: T) => string;
  private _selection: Map<string, SelectionItem<T>>;
  private _active?: SelectionItem<T>;
  private sortIndex = 0;
}

export class SelectionManagerProxy<T> implements ISelectionManager<T> {
  private off: Function | undefined;
  private target: ISelectionManager<T>;
  constructor() {
    this.events = buildEmitter<SelectionEvent<T>>(false);
    this.updateManager(new SelectionManager<T>());
  }
  updateManager(manager: ISelectionManager<T>) {
    if (this.off) this.off();
    this.off = undefined;
    this.events.emit("changed", {
      added: manager.selected(),
      removed: this.target ? this.target.selected() : [],
      changedPinned: manager.getPinned(),
    });
    this.off = manager.events.on("*", (type, data) => {
      this.events.emit(type as keyof SelectionEvent<T>, data as any);
    });
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
  clone(): SelectionManager<T> {
    return this.target.clone();
  }
  active(): T {
    return this.target.active();
  }
  activeIndex(): number {
    return this.target.activeIndex();
  }
  isSelected(key: T): boolean {
    return this.target.isSelected(key);
  }
  isPinned(key: T): boolean {
    return this.target.isPinned(key);
  }
  selected(): T[] {
    return this.target.selected();
  }
  getPinned() {
    return this.target.getPinned();
  }
  last(): T | undefined {
    return this.target.last();
  }
  events: Emitter<SelectionEvent<T>>;
}
