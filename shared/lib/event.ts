import { uuid } from "./utils";

export type EventType = string | symbol;

// An event handler can take an optional event argument
// and should not return a value
export type Handler<T = unknown> = (event: T) => void;
export type HandlerWithType<T = unknown> = (type: string, event: T) => void;
export type OffFunction = () => void;

export type FilterFct<T = Record<string, unknown>> = (
  type: keyof T,
  event: T[keyof T],
) => boolean;

export interface Emitter<Events extends Record<EventType, unknown>> {
  on<Key extends keyof Events>(
    type: Key,
    handler: Handler<Events[Key]>,
  ): OffFunction;
  on<Key extends "*">(
    type: Key,
    handler: HandlerWithType<Events[Key]>,
  ): OffFunction;
  has<Key extends "*" | keyof Events>(type: Key): number;
  once<Key extends keyof Events>(
    type: Key,
    handler: Handler<Events[Key]>,
  ): OffFunction;

  off(id: string): void;

  emit<Key extends keyof Events>(type: Key, event: Events[Key]): boolean;
  emit<Key extends keyof Events>(
    type: undefined extends Events[Key] ? Key : never,
  ): boolean;
}

export function buildEmitter<Events extends Record<EventType, unknown>>(
  weakRef: boolean = false,
): Emitter<Events> {
  type HandlerEntry = { handler: Function; once: boolean };
  type EventHandlers = { [key: string]: WeakRef<HandlerEntry> };
  type EventMap = { [event: string]: EventHandlers };
  const all: EventMap = {};

  const hardRefs: any[] = [];
  const has = (type: "*" | keyof Events) => {
    const typeAsString = type as string;
    let handlers = all[typeAsString];
    if (!handlers) {
      return 0;
    }
    return Object.keys(handlers).length;
  };
  const on = (
    type: "*" | keyof Events,
    handler: Function,
    once: boolean = false,
  ) => {
    const typeAsString = type as string;
    const entry = { handler, once, off: false };
    let handlers = all[typeAsString];
    const id = uuid();
    if (!handlers) {
      all[typeAsString] = {};
    }
    all[typeAsString][id] = new WeakRef(entry);
    if (weakRef !== true) {
      hardRefs.push(entry);
    }
    return () => {
      entry.off = true;
      off(id);
    };
  };
  const once = (type: keyof Events, handler: Function) => {
    return on(type, handler, true);
  };

  const off = (id: string) => {
    for (const handlers of Object.values(all)) {
      delete handlers[id];
    }
  };

  const emit = <Key extends keyof Events>(
    type: Key,
    evt?: Events[Key],
  ): boolean => {
    let res = false;
    const typeAsString = type as string;
    let handlers = { ...all[typeAsString], ...all["*"] };

    if (handlers) {
      for (const [id, entry] of Object.entries(handlers)) {
        const val = entry.deref();
        if (!val) {
          if (weakRef !== true) {
            console.error("Handler is garbage collected ???", hardRefs);
          }
          debugger;
          console.warn(
            `Removing handler ${id} of type ${type.toString()} because the function was garbage collected`,
          );
          off(id);
        } else {
          if (val.once) {
            off(id);
          }
          try {
            let consumed = false;
            if (id === "*") {
              consumed = val.handler(type, evt!);
            } else {
              consumed = val.handler(evt!);
            }
            if (consumed === true) {
              return true;
            }
          } catch (e) {
            console.error(`Exception in event handler`, e);
          }
          res = true;
        }
      }
    }
    return res;
  };
  return {
    /**
     * A Map of event names to registered handler functions.
     */
    on: on as any,
    once: once as any,
    off: off as any,
    emit: emit as any,
    has: has as any,
  };
}
