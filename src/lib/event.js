"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildEmitter = void 0;
function buildEmitter(all, allOnce) {
    all = all || new Map();
    allOnce = allOnce || new Map();
    return {
        /**
         * A Map of event names to registered handler functions.
         */
        all,
        allOnce,
        /**
         * Register an event handler for the given type.
         * @param {string|symbol} type Type of event to listen for, or `'*'` for all events
         * @param {Function} handler Function to call in response to given event
         * @memberOf mitt
         */
        on(type, handler) {
            const handlers = all.get(type);
            if (handlers) {
                handlers.push(handler);
            }
            else {
                all.set(type, [handler]);
            }
        },
        /**
         * Register an event handler for the given type.
         * @param {string|symbol} type Type of event to listen for, or `'*'` for all events
         * @param {Function} handler Function to call in response to given event
         * @memberOf mitt
         */
        once(type, handler) {
            const handlers = allOnce.get(type);
            if (handlers) {
                handlers.push(handler);
            }
            else {
                allOnce.set(type, [handler]);
            }
        },
        /**
         * Remove an event handler for the given type.
         * If `handler` is omitted, all handlers of the given type are removed.
         * @param {string|symbol} type Type of event to unregister `handler` from, or `'*'`
         * @param {Function} [handler] Handler function to remove
         * @memberOf mitt
         */
        off(type, handler) {
            const handlers = all.get(type);
            if (handlers) {
                if (handler) {
                    handlers.splice(handlers.indexOf(handler) >>> 0, 1);
                }
                else {
                    all.set(type, []);
                }
            }
        },
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
        emit(type, evt) {
            let handlers = all.get(type);
            if (handlers) {
                handlers
                    .slice()
                    .map((handler) => {
                    handler(evt);
                });
            }
            handlers = allOnce.get(type);
            allOnce.set(type, []);
            if (handlers) {
                handlers
                    .slice()
                    .map((handler) => {
                    handler(evt);
                });
            }
            handlers = all.get("*");
            if (handlers) {
                handlers
                    .slice()
                    .map((handler) => {
                    handler(type, evt);
                });
            }
        },
    };
}
exports.buildEmitter = buildEmitter;
//# sourceMappingURL=event.js.map