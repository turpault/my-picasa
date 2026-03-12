/**
 * Creates a typed RPC client proxy that forwards method calls to the transport.
 * No codegen: method names come from the contract (shared/rpc-contracts).
 */

export interface RpcTransportLike {
  emit(
    action: string,
    payload: unknown,
    callback?: (err: string, payload: unknown) => void
  ): Promise<void>;
  on(action: string, callback: (payload: unknown, callback: Function) => void): Function;
}

/**
 * Builds an args object from positional arguments and method name.
 * The server expects payload.args to be an object with named keys; we don't have param names
 * at runtime, so we use the same convention as the compiler: pass args as an object.
 * We use arg0, arg1, ... for ordering, but the server's getConvertedArguments uses
 * service.arguments (param names). So we must pass named args. The generated code had
 * 'args': { entry }, 'args': { context, hint }, etc. So we need the contract to supply
 * param names, or we pass arguments by position and the server maps by position.
 * Looking at rpc-handler getConvertedArguments: it does service.arguments.forEach and
 * args[argumentName] - so the payload.args must be keyed by argument name (entry, context, hint, etc).
 * So we cannot derive names from the proxy without the contract including them.
 * Option A: Contract includes for each method the list of param names. Then we build
 * payload.args = { [paramNames[0]]: arguments[0], [paramNames[1]]: arguments[1], ... }.
 * Option B: Pass arguments as array and change server to accept positional args. That would
 * require server change. So Option A: we need param names in the contract.
 *
 * Actually re-reading the generated client: each method does
 * this.emit('PicisaClient:buildContext', { 'args': { entry } });
 * So the keys are the argument names (entry, context, hint, etc). So our proxy must know
 * the argument names for each method. Easiest: add to contract a map methodName -> paramNames[].
 * Or we could export from server the ServiceMap and have shared only reference the method names
 * and the server exports the full ServiceMap - but then shared would need to import from server
 * for param names, which is backwards. So: add to shared contract a record of method -> param names.
 * The server's ServiceMap already has that (arguments: ["entry:object"]). So we have two sources of
 * truth unless we put param names in the contract. Let's add to contracts:
 * PICISA_PARAMS: { [K in PicisaMethod]: string[] } or for each method an array of arg names.
 * That way the proxy can build args = { [paramNames[i]]: arguments[i] }.
 */
type ParamNamesMap = Record<string, readonly string[]>;

function buildArgs(paramNames: readonly string[], values: unknown[]): Record<string, unknown> {
  const args: Record<string, unknown> = {};
  paramNames.forEach((name, i) => {
    args[name] = values[i];
  });
  return args;
}

/**
 * Creates a typed RPC client that forwards calls to the transport.
 * @param transport - adaptor with emit(action, payload, callback) and on(action, callback)
 * @param serviceName - e.g. 'PicisaClient' or 'WalkerWorkerClient'
 * @param methodNames - list of method names from contract
 * @param paramNamesMap - map of method name -> ordered param names (for payload.args)
 */
export function createRPCClient<T>(
  transport: RpcTransportLike,
  serviceName: string,
  methodNames: readonly string[],
  paramNamesMap: ParamNamesMap
): T {
  const methodSet = new Set(methodNames);

  const handler: ProxyHandler<object> = {
    get(_target, prop: string) {
      if (prop === "on") {
        return (event: string, cb: (payload: unknown) => void) =>
          transport.on(event, (payload, _responseCallback) => {
            cb(payload);
          });
      }
      if (methodSet.has(prop)) {
        const paramNames = paramNamesMap[prop] ?? [];
        return (...args: unknown[]) => {
          const payload = { args: buildArgs(paramNames, args) };
          return new Promise((resolve, reject) => {
            transport.emit(`${serviceName}:${prop}`, payload, (err: string, response: unknown) => {
              if (err) reject(err);
              else resolve(response);
            });
          });
        };
      }
      return undefined;
    },
  };

  return new Proxy({}, handler) as T;
}
