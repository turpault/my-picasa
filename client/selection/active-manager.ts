import { buildEmitter, Emitter } from "../../shared/lib/event";
import { ActiveImageEvent, AlbumEntry } from "../../shared/types/types";
import { albumEntryIndexInList } from "../lib/dom";

export class ActiveImageManager {
  constructor(lst: AlbumEntry[], current: AlbumEntry) {
    this._list = lst;
    this._current = current;
    this.event = buildEmitter<ActiveImageEvent>();
  }

  list(): AlbumEntry[] {
    return this._list;
  }
  active(): AlbumEntry {
    return this._current;
  }

  select(entry: AlbumEntry) {
    this._current = entry;
    this.event.emit("changed", entry);
  }

  selectNext() {
    const idx = albumEntryIndexInList(this._current, this._list);
    if (idx < this._list.length - 1) {
      this._current = this._list[idx + 1];
      this.event.emit("changed", this._current);
    }
  }

  selectPrevious() {
    const idx = albumEntryIndexInList(this._current, this._list);
    if (idx > 0) {
      this._current = this._list[idx - 1];
      this.event.emit("changed", this._current);
    }
  }

  event: Emitter<ActiveImageEvent>;

  private _list: AlbumEntry[];
  private _current: AlbumEntry;
}
