import { uuid } from "./utils";

export type EventType = string | symbol;

// An event handler can take an optional event argument
// and should not return a value
export type Handler<T = unknown> = (event: T) => void;
export type OffFunction = () => void;

export type FilterFct<T = Record<string, unknown>> = (
  type: keyof T,
  event: T[keyof T]
) => boolean;

export interface Emitter<Events extends Record<EventType, unknown>> {
  on<Key extends keyof Events>(
    type: Key,
    handler: Handler<Events[Key]>
  ): OffFunction;
  once<Key extends keyof Events>(
    type: Key,
    handler: Handler<Events[Key]>
  ): OffFunction;

  off(id: string): void;

  emit<Key extends keyof Events>(type: Key, event: Events[Key]): boolean;
  emit<Key extends keyof Events>(
    type: undefined extends Events[Key] ? Key : never
  ): boolean;
}

export function buildEmitter<Events extends Record<EventType, unknown>>(
  weakRef: boolean = false
): Emitter<Events> {
  type HandlerEntry = { handler: Function; once: boolean };
  type EventHandlers = Map<string, WeakRef<HandlerEntry>>;
  const all = new Map<keyof Events, EventHandlers>();

  const hardRefs: any[] = [];
  const on = (type: keyof Events, handler: Function, once: boolean = false) => {
    const iKeepRef = hardRefs;
    const entry = { handler, once, off: false };
    let handlers = all!.get(type);
    const id = uuid();
    if (!handlers) {
      handlers = new Map<string, WeakRef<HandlerEntry>>();
      all.set(type, handlers);
    }
    handlers.set(id, new WeakRef(entry));
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
    for (const handlers of all.values()) {
      handlers.delete(id);
    }
  };

  const emit = <Key extends keyof Events>(
    type: Key,
    evt?: Events[Key]
  ): boolean => {
    let res = false;
    let handlers = all!.get(type);
    if (handlers) {
      Array.from(handlers.entries()).forEach(([id, entry]) => {
        const val = entry.deref();
        if (!val) {
          if (weakRef !== true) {
            console.error("Handler is garbage collected ???", hardRefs);
          }
          debugger;
          console.warn(
            `Removing handler ${id} of type ${type.toString()} because the function was garbage collected`
          );
          handlers!.delete(id);
        } else {
          val.handler(evt!);
          res = true;
          if (val.once) {
            handlers!.delete(id);
          }
        }
      });
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
  };
}
