
export type EventType = string | symbol;

// An event handler can take an optional event argument
// and should not return a value
export type Handler<T = unknown> = (event: T) => void;
export type OffFunction = () => void;
export type WildcardHandler<T = Record<string, unknown>> = (
  type: keyof T,
  event: T[keyof T]
) => void;

export type FilterFct<T = Record<string, unknown>> = (
  type: keyof T,
  event: T[keyof T]
) => boolean;

// An array of all currently registered event handlers for a type
export type EventHandlerList<T = unknown> = Array<Handler<T>>;
export type WildCardEventHandlerList<T = Record<string, unknown>> = Array<
  WildcardHandler<T>
>;

// A map of event types and their corresponding event handlers.
export type EventHandlerMap<Events extends Record<EventType, unknown>> = Map<
  keyof Events | "*",
  EventHandlerList<Events[keyof Events]> | WildCardEventHandlerList<Events>
>;

export interface Emitter<Events extends Record<EventType, unknown>> {
  all: EventHandlerMap<Events>;
  allOnce: EventHandlerMap<Events>;

  on<Key extends keyof Events>(
    type: Key,
    handler: Handler<Events[Key]>
  ): OffFunction;
  on(type: "*", handler: WildcardHandler<Events>): OffFunction;
  once<Key extends keyof Events>(
    type: Key,
    handler: Handler<Events[Key]>
  ): OffFunction;
  once(type: "*", handler: WildcardHandler<Events>): OffFunction;

  off<Key extends keyof Events>(
    type: Key,
    handler?: Handler<Events[Key]>
  ): void;
  off(type: "*", handler: WildcardHandler<Events>): void;

  emit<Key extends keyof Events>(type: Key, event: Events[Key]): boolean;
  emit<Key extends keyof Events>(
    type: undefined extends Events[Key] ? Key : never
  ): boolean;
}

export function buildEmitter<Events extends Record<EventType, unknown>>(
  filter?: FilterFct,
  all?: EventHandlerMap<Events>,
  allOnce?: EventHandlerMap<Events>
): Emitter<Events> {
  type GenericEventHandler =
    | Handler<Events[keyof Events]>
    | WildcardHandler<Events>;
  all = all || new Map();
  allOnce = allOnce || new Map();
  type Key = keyof Events;

  filter = filter || ((() => true) as FilterFct);

  const on: <Key extends keyof Events>(
    type: Key,
    handler: GenericEventHandler
  ) => OffFunction = (type: Key, handler: GenericEventHandler) => {
    const handlers: Array<GenericEventHandler> | undefined = all!.get(type);
    if (handlers) {
      handlers.push(handler);
    } else {
      all!.set(type, [handler] as EventHandlerList<Events[keyof Events]>);
    }
    return () => {
      off(type, handler);
    };
  };
  const once: <Key extends keyof Events>(
    type: Key,
    handler: GenericEventHandler
  ) => OffFunction = (type: Key, handler: GenericEventHandler) => {
    const handlers: Array<GenericEventHandler> | undefined = allOnce!.get(type);
    if (handlers) {
      handlers.push(handler);
    } else {
      allOnce!.set(type, [handler] as EventHandlerList<Events[keyof Events]>);
    }
    return () => {
      off(type, handler);
    };
  };
  const off: <Key extends keyof Events>(
    type: Key,
    handler?: GenericEventHandler
  ) => void = (type: Key, handler?: GenericEventHandler) => {
    const handlers: Array<GenericEventHandler> | undefined = all!.get(type);
    if (handlers) {
      if (handler) {
        handlers.splice(handlers.indexOf(handler) >>> 0, 1);
      } else {
        all!.set(type, []);
      }
    }
  };

  return {
    /**
     * A Map of event names to registered handler functions.
     */
    all,
    allOnce,
    on,
    once,
    off,

    /**
     * Invoke all handlers for the given type.
     * If present, `'*'` handlers are invoked after type-matched handlers.
     *
     * Note: Manually firing '*' handlers is not supported.
     *
     * @param {string|symbol} type The event type to invoke
     * @param {Any} [evt] Any value (object is recommended and powerful), passed to each handler
     * @memberOf mitt
     */
    emit<Key extends keyof Events>(type: Key, evt?: Events[Key]): boolean {
      let res = false;
      let handlers = all!.get(type);
      if (handlers) {
        (handlers as EventHandlerList<Events[keyof Events]>)
          .slice()
          .map((handler) => {
            res = true;
            handler(evt!);
          });
      }
      handlers = allOnce!.get(type);
      allOnce!.set(type, []);
      if (handlers) {
        (handlers as EventHandlerList<Events[keyof Events]>)
          .slice()
          .map((handler) => {
            handler(evt!);
            res = true;
          });
      }

      handlers = all!.get("*");
      if (handlers) {
        (handlers as WildCardEventHandlerList<Events>)
          .slice()
          .map((handler) => {
            handler(type, evt!);
            res = true;
          });
      }
      return res;
    },
  };
}
