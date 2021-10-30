import { buildEmitter, Emitter } from "../lib/event.js";
import { ActiveImageEvent } from "../types/types.js";

export class ActiveImageManager {
  constructor(lst: string[], current: string) {
    this.list = lst;
    this.current = current;
    this.event = buildEmitter<ActiveImageEvent>();
  }

  active(): string {
    return this.current;
  }

  select(name: string) {
    if (this.list.indexOf(name) != -1) {
      this.current = name;
      this.event.emit("changed", { name: this.current });
    }
  }

  selectNext() {
    const idx = this.list.indexOf(this.current);
    if (idx < this.list.length-1) {
      this.current = this.list[idx + 1];
      this.event.emit("changed", { name: this.current });
    }
  }

  selectPrevious() {
    const idx = this.list.indexOf(this.current);
    if (idx > 0) {
      this.current = this.list[idx - 1];
      this.event.emit("changed", { name: this.current });
    }
  }

  event: Emitter<ActiveImageEvent>;

  private list: string[];
  private current: string;
}
