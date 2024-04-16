import { buildEmitter } from "../../shared/lib/event";

export type StateDef = { [key: string]: any };
/**
 * A simple state class that can be used to store state and emit events when the state changes.
 */
export class State<T extends StateDef> {
  constructor() {
    this.state = {} as T;
  }
  getValue<K extends keyof T>(key: K): T[K] {
    return this.state[key];
  }
  setValueByRef(key: keyof T, value: T[typeof key]) {
    this.state[key] = value;
    this.events.emit(key, value);
    return true;
  }
  setValue(key: keyof T, value: any) {
    if (typeof value === "object") {
      if (JSON.stringify(value) === JSON.stringify(this.state[key])) {
        return true;
      }
      value = structuredClone(value);
    }
    if (value === this.state[key] && key in this.state) {
      return true;
    }
    const res = this.preevents.emit(key, value);
    if (res === true) {
      return false;
    }
    this.state[key] = value;
    this.events.emit(key, value);
    return true;
  }
  setValues(values: { [key: string]: any }) {
    for (const [key, value] of Object.entries(values)) {
      this.setValue(key, value);
    }
  }
  public events = buildEmitter<T>();
  public preevents = buildEmitter<T>();
  private state: T;
}
