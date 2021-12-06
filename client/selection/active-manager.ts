import { buildEmitter, Emitter } from "../../shared/lib/event";
import { albumEntryIndexInList } from "../../shared/lib/utils";
import { ActiveImageEvent, AlbumEntry } from "../../shared/types/types";

export class ActiveImageManager {
  constructor(lst: AlbumEntry[], current: AlbumEntry) {
    this.list = lst;
    this.current = current;
    this.event = buildEmitter<ActiveImageEvent>();
  }

  active(): AlbumEntry {
    return this.current;
  }

  select(entry: AlbumEntry) {
    this.current = entry;
    this.event.emit("changed", entry);
  }

  selectNext() {
    const idx = albumEntryIndexInList(this.current, this.list);
    if (idx < this.list.length - 1) {
      this.current = this.list[idx + 1];
      this.event.emit("changed", this.current);
    }
  }

  selectPrevious() {
    const idx = albumEntryIndexInList(this.current, this.list);
    if (idx > 0) {
      this.current = this.list[idx - 1];
      this.event.emit("changed", this.current);
    }
  }

  event: Emitter<ActiveImageEvent>;

  private list: AlbumEntry[];
  private current: AlbumEntry;
}
