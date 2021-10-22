import { buildEmitter, Emitter } from "../lib/event.js";

export type SelectionEvent = {
  added: { key: string; selection: string[] };
  removed: { key: string; selection: string[] };
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
    this.selection = new Set<string>();
    this.events = buildEmitter<SelectionEvent>();
  }
  isSelected(key: string): boolean {
    return this.selection.has(key);
  }
  select(key: string) {
    if (!this.selection.has(key)) {
      this.selection.add(key);
      this.events.emit("added", { key, selection: Array.from(this.selection) });
    }
  }
  deselect(key: string) {
    if (this.selection.has(key)) {
      this.selection.delete(key);
      this.events.emit("removed", {
        key,
        selection: Array.from(this.selection),
      });
    } else debugger;
  }

  clear() {
    while (this.selection.size > 0) {
      const first = this.selection.values().next().value;
      this.deselect(first);
    }
  }

  events: Emitter<SelectionEvent>;
  private selection: Set<string>;
}
