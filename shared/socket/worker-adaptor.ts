import { isMainThread, parentPort, Worker } from "worker_threads";
import { sleep, uuid } from "../lib/utils";
import { buildEmitter, Emitter, Handler } from "../lib/event";
import { RPCAdaptorInterface } from "./rpc-adaptor-interface";

const defaultTimeoutInSeconds = 180;
const retryDelayInSeconds = 1;

function _getTimeoutInSeconds(): number {
  return defaultTimeoutInSeconds;
}

/**
 * Wraps a Worker thread, so that we can use it for RPC communication
 * Can be used from either the main thread (with a Worker instance) or from a worker thread (using parentPort)
 */
export class WorkerAdaptor implements RPCAdaptorInterface {
  constructor(worker?: Worker) {
    this.handlerMap = buildEmitter<any>(false);
    this.responseCallbacks = {};
    this.middleware = [];
    this.closed = false;
    this.worker = worker;
    this.timeoutMillis = _getTimeoutInSeconds() * 1000;
    this.maxRetries = WorkerAdaptor.MAX_RETRIES;

    if (worker) {
      // Main thread: listen to worker messages
      this.setMessageListener();
    } else if (!isMainThread && parentPort) {
      // Worker thread: listen to parent messages
      this.setMessageListener();
    }
  }

  private worker: Worker | undefined;
  public handlerMap: Emitter<any>;
  private responseCallbacks: { [id: string]: Function }; // Map of ids <=> callbacks to be performed when a response is received
  private middleware: Array<Function>; // All middleware functions to be performed on incoming messages
  private timeoutMillis: number = defaultTimeoutInSeconds;
  private maxRetries: number;
  public closed: boolean;

  public static REQUEST_TYPE = "request";
  public static RESPONSE_TYPE = "response";
  public static ERROR_NOT_IMPLEMENTED = "That action has not been implemented";
  public static ERROR_TIMEOUT = "Timed out while awaiting response";
  public static ERROR_DISCONNECTED = "Worker was disconnected";

  private static TIMEOUT_MULTIPLIER = 1.25;
  private static MAX_RETRIES = 10;

  setMaxRetries(_maxRetries: number) {
    this.maxRetries = _maxRetries;
  }

  /**
   * Registers a middleware function that will be called on each incoming request
   */
  use(middlewareHandler: (data: any, next: Function) => void): void {
    this.middleware.push(middlewareHandler);
  }

  /**
   * Registers a handler for an incoming action.
   */
  on(
    action: string,
    callback: (payload: any, callback: Function) => void,
  ): Function {
    return this.handlerMap.on(action, callback as Handler<any>);
  }

  /**
   * Sends out the request, and registers a listener for the response. Will retry sending the message if a response has
   * not been received in a timely fashion.
   */
  async emit(
    action: string,
    payload: any,
    response?: (err: string, payload: any) => void,
  ): Promise<void> {
    let requestId = undefined;
    if (response) {
      requestId = uuid();
      this.responseCallbacks[requestId] = response;
    }
    const message = {
      type: WorkerAdaptor.REQUEST_TYPE,
      requestId,
      action,
      payload,
    };
    try {
      return this.emitRetry(message, this.maxRetries - 1, retryDelayInSeconds);
    } catch (e) {
      this.handlerMap.emit("error", e);
    }
  }

  /**
   * Sets the handler that should be performed when the worker is closed / disconnected.
   * @param callback
   */
  onDisconnect(callback: (event: any) => void): void {
    if (this.worker) {
      // Main thread: listen to worker exit
      this.worker.on("exit", (...args) => {
        this.closed = true;
        callback(...args);
      });
      this.worker.on("error", (...args) => {
        this.closed = true;
        callback(...args);
      });
    } else if (!isMainThread && parentPort) {
      // Worker thread: can't really detect disconnect from parent, but we can set a flag
      // The parent would need to handle this differently
      this.closed = false; // Keep it open since we can't detect parent disconnect easily
    }
  }

  /**
   * Disconnects the worker.
   */
  disconnect(): void {
    this.closed = true;
    if (this.worker) {
      this.worker.terminate();
    }
    // In worker thread, we can't disconnect from parent, but we can mark as closed
  }

  /**
   * Sends the message, and then sets a timer to see if a response has been received. If one has not been received, then
   * the message will be resent. Will fail after the maximum number of retries.
   */
  private async emitRetry(
    message: object,
    remainingRetries: number,
    retryDelay: number,
  ): Promise<void> {
    const canSend = this.canSendMessage();
    if (!canSend) {
      if (remainingRetries > 0) {
        await sleep(retryDelay);
        return this.emitRetry(
          message,
          remainingRetries - 1,
          retryDelay * WorkerAdaptor.TIMEOUT_MULTIPLIER,
        );
      }
      console.warn(
        "Worker has been closed, cannot send message",
        JSON.stringify(message).slice(0, 50),
      );
      return;
    }
    this.sendMessage(message);
  }

  /**
   * Checks if we can send a message
   */
  private canSendMessage(): boolean {
    if (this.closed) {
      return false;
    }
    if (this.worker) {
      // Main thread: check if worker is still running
      return true; // Worker threads don't have a readyState like WebSockets
    } else if (!isMainThread && parentPort) {
      // Worker thread: parentPort should always be available
      return true;
    }
    return false;
  }

  /**
   * Sends a message through the appropriate channel
   */
  private sendMessage(message: object): void {
    if (this.worker) {
      // Main thread: send to worker
      this.worker.postMessage(message);
    } else if (!isMainThread && parentPort) {
      // Worker thread: send to parent
      parentPort.postMessage(message);
    }
  }

  /**
   * Sets the listener for incoming messages. We will use one generic listener which will dispatch payloads
   * to the appropriate handler that has been registered.
   */
  private setMessageListener(): void {
    if (this.worker) {
      // Main thread: listen to worker messages
      this.worker.on("message", (message: any) => {
        this.handleMessage(message);
      });
    } else if (!isMainThread && parentPort) {
      // Worker thread: listen to parent messages
      parentPort.on("message", (message: any) => {
        this.handleMessage(message);
      });
    }
  }

  /**
   * Takes in a message, checks if it is a request or a response, and then acts accordingly
   */
  private async handleMessage(message: any): Promise<void> {
    // If message is already an object, use it directly; otherwise parse it
    let args: any;
    if (typeof message === "string") {
      try {
        args = JSON.parse(message);
      } catch (err) {
        console.log(
          `Failed parsing message ${message}. Will be unable to respond.`,
        );
        return;
      }
    } else {
      args = message;
    }

    if (args.type === WorkerAdaptor.REQUEST_TYPE) {
      await this.handleIncomingRequest(args);
    } else if (args.type === WorkerAdaptor.RESPONSE_TYPE) {
      await this.handleIncomingResponse(args);
    } else {
      console.log(`Malformed message ${JSON.stringify(message)}. Will be unable to respond.`);
      return;
    }
  }

  /**
   * Will attempt to find the correct handler, execute the necessary logic for the message, and then send back a response
   */
  private async handleIncomingRequest(args: any): Promise<void> {
    const messageStr = JSON.stringify(args);
    await this.executeMiddleware(messageStr);

    // Find the handler - if one doesn't exist, send error
    const handled = this.handlerMap.emit(args.action, {
      payload: args.payload,
      callback: (error: string, payload: object) => {
        // Try executing the handler
        const response = {
          type: WorkerAdaptor.RESPONSE_TYPE,
          requestId: args.requestId,
          error,
          payload: payload ? payload : {},
        };

        if (this.closed) {
          return;
        }
        this.sendMessage(response);
      },
    });
    if (!handled) {
      console.info(`[WorkerAdaptor]: Handler ${args.action} not implemented`);
      const response = {
        type: WorkerAdaptor.RESPONSE_TYPE,
        requestId: args.requestId,
        error: WorkerAdaptor.ERROR_NOT_IMPLEMENTED,
      };
      if (this.closed) {
        return;
      }
      this.sendMessage(response);
      return;
    }
  }

  /**
   * Iterates through all registered middleware functions and executes them on the message
   */
  private async executeMiddleware(message: string): Promise<void> {
    await Promise.all(
      this.middleware.map((fn) => {
        fn(message, () => {});
      }),
    );
  }

  /**
   * Will map the incoming data to the appropriate handler for the response
   */
  private handleIncomingResponse(args: any): void {
    const requestId = args.requestId;

    if (!requestId) {
      console.log(
        `No requestId in the received response: ${JSON.stringify(args)}`,
      );
      return;
    }

    const cb = this.responseCallbacks[requestId];
    delete this.responseCallbacks[requestId]; // So that we don't perform a retry

    if (!cb) {
      return;
    }

    cb(args.error, args.payload);
  }
}

