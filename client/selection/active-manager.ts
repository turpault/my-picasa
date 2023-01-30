import { buildEmitter, Emitter } from "../../shared/lib/event";
import { ActiveImageEvent, AlbumEntryPicasa } from "../../shared/types/types";
import { albumEntryIndexInList } from "../lib/dom";

export class ActiveImageManager {
  constructor(lst: AlbumEntryPicasa[], current: AlbumEntryPicasa) {
    this._list = lst;
    this._current = current;
    this.event = buildEmitter<ActiveImageEvent>();
  }

  list(): AlbumEntryPicasa[] {
    return this._list;
  }
  active(): AlbumEntryPicasa {
    return this._current;
  }

  select(entry: AlbumEntryPicasa) {
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

  private _list: AlbumEntryPicasa[];
  private _current: AlbumEntryPicasa;
}
