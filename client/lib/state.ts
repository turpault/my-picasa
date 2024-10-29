import { buildEmitter } from "../../shared/lib/event";

export type StateDef = { [key: string]: any };
/**
 * A simple state class that can be used to store state and emit events when the state changes.
 */
export class State<T extends StateDef> {
  constructor(private state: T = {} as T) {}
  getValue<K extends keyof T>(key: K): T[K] {
    return this.state[key];
  }
  getValues(): T {
    return Object.assign({}, this.state);
  }
  setValueByRef(key: keyof T, value: T[typeof key]) {
    if (value === this.state[key] && key in this.state) {
      return true;
    }
    this.old.emit(key, this.state[key]);
    const res = this.preevents.emit(key, value);
    if (res === true) {
      return false;
    }
    this.state[key] = value;
    this.events.emit(key, value);
    return true;
    }
  clearValue(key: keyof T) {
    if (key in this.state) {
      delete this.state[key];
      this.events.emit(key, undefined);
    }
    return true;
  }
  setValue(key: keyof T, value: T[typeof key]) {
    if (typeof value === "object") {
      if (JSON.stringify(value) === JSON.stringify(this.state[key])) {
        return true;
      }
      value = structuredClone(value);
    }
    return this.setValueByRef(key, value);
  }
  setValues(values: { [key: string]: any }) {
    for (const [key, value] of Object.entries(values)) {
      this.setValue(key, value);
    }
  }
  public events = buildEmitter<T>();
  public preevents = buildEmitter<T>();
  public old = buildEmitter<T>();
}
