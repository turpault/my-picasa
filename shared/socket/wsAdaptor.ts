import { buildEmitter, Emitter, Handler } from "../lib/event";
import { sleep, uuid } from "../../shared/lib/utils";
import { SocketAdaptorInterface } from "./socketAdaptorInterface";

const defaultTimeoutInSeconds = 180;
const retryDelayInSeconds = 1;

function _getTimeoutInSeconds(): number {
  return defaultTimeoutInSeconds;
}

/**
 * Wraps a WebSocket, so that we can use it in a similar manner to how we were using socket-io
 */
export class WsAdaptor implements SocketAdaptorInterface {
  constructor() {
    this.handlerMap = buildEmitter<any>();
    this.responseCallbacks = {};
    this.middleware = [];
    this.closed = false;

    this.timeoutMillis = _getTimeoutInSeconds() * 1000;
    this.maxRetries = WsAdaptor.MAX_RETRIES;
  }

  private ws: WebSocket | undefined;
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
  public static ERROR_DISCONNECTED = "Socket was disconnected";

  private static TIMEOUT_MULTIPLIER = 1.25;
  private static MAX_RETRIES = 10;

  socket(ws: WebSocket) {
    this.ws = ws;
    this.setMessageListener();
  }
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
    callback: (payload: any, callback: Function) => void
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
    response?: (err: string, payload: any) => void
  ): Promise<void> {
    let requestId = undefined;
    if (response) {
      requestId = uuid();
      this.responseCallbacks[requestId] = response;
    }
    const message = JSON.stringify({
      type: WsAdaptor.REQUEST_TYPE,
      requestId,
      action,
      payload,
    });
    try {
      return this.emitRetry(message, this.maxRetries - 1, retryDelayInSeconds);
    } catch (e) {
      this.handlerMap.emit("error", e);
    }
  }

  /**
   * Sets the handler that should be performed when the socket is closed / disconnected.
   * @param callback
   */
  onDisconnect(callback: (event: any) => void): void {
    this.ws!.onclose = (...args) => {
      this.closed = true;
      callback(...args);
    };
  }

  /**
   * Disconnects the websocket.
   */
  disconnect(): void {
    this.closed = true;
    this.ws!.close();
  }

  /**
   * Disconnects the websocket.
   */
  shutdown(): void {
    this.ws!.close();
  }
  /**
   * Sends the message, and then sets a timer to see if a response has been received. If one has not been received, then
   * the message will be resent. Will fail after the maximum number of retries.
   */
  private async emitRetry(
    message: string | object,
    remainingRetries: number,
    retryDelay: number
  ): Promise<void> {
    if (this.ws!.readyState !== 1) {
      if(this.ws!.onerror)
        this.ws!.onerror({} as Event);
      if (remainingRetries > 0) {
        await sleep(retryDelay);
        return this.emitRetry(
          message,
          remainingRetries - 1,
          retryDelay * WsAdaptor.TIMEOUT_MULTIPLIER
        );
      }
      console.warn('Socket has been closed, cannot send message', JSON.stringify(message).slice(0,50));
    }
    this.ws!.send(message.toString());
  }

  /**
   * Sets the listener for incoming messages to the websocket. We will use one generic listener which will dispatch payloads
   * to the appropriate handler that has been registered.
   */
  private setMessageListener(): void {
    this.ws!.onmessage = (message: any) => {
      this.handleMessage(
        message.data
          ? message.data.toString()
          : ((message as unknown) as string)
      );
    };
  }

  /**
   * Takes in a message on the socket, checks if it is a request or a response, and then acts accordingly
   */
  private async handleMessage(message: string): Promise<void> {
    let args: any;
    try {
      args = JSON.parse(message);
    } catch (err) {
      console.log(
        `Failed parsing message ${message}. Will be unable to respond.`
      );
      return;
    }

    if (args.type === WsAdaptor.REQUEST_TYPE) {
      await this.handleIncomingRequest(message, args);
    } else if (args.type === WsAdaptor.RESPONSE_TYPE) {
      await this.handleIncomingResponse(args);
    } else {
      console.log(`Malformed message ${message}. Will be unable to respond.`);
      return;
    }
  }

  /**
   * Will attempt to find the correct handler, execute the necessary logic for the message, and then send back a response
   */
  private async handleIncomingRequest(
    message: string,
    args: any
  ): Promise<void> {
    await this.executeMiddleware(message);

    // Find the handler - if one doesn't exist, send error
    const handled = this.handlerMap.emit(args.action, {
      payload: args.payload,
      callback: (error: string, payload: object) => {
        // Try executing the handler
        const response = JSON.stringify({
          type: WsAdaptor.RESPONSE_TYPE,
          requestId: args.requestId,
          error,
          payload: payload ? payload : {},
        });

        if (this.ws!.readyState !== 1) {
          if(this.ws!.onerror) {
            this.ws!.onerror!({} as Event);
          }
          return;
        }
        // console.debug(`Sending ${error ? 'error' : 'success'} response ${response}`);
        this.ws!.send(response);
      },
    });
    if (!handled) {
      console.info(`[WsAdaptor]: Handler ${args.action} not implemented`);
      const response = JSON.stringify({
        type: WsAdaptor.RESPONSE_TYPE,
        requestId: args.requestId,
        error: WsAdaptor.ERROR_NOT_IMPLEMENTED,
      });
      // console.debug(`Sending error response ${response}`);
      if (this.ws!.readyState !== 1) {
        this.ws!.onerror!({} as Event);
        return;
      }
      this.ws!.send(response);
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
      })
    );
  }

  /**
   * Will map the incoming data to the appropriate handler for the response
   */
  private handleIncomingResponse(args: any): void {
    const requestId = args.requestId;

    if (!requestId) {
      console.log(
        `No requestId in the received response: ${JSON.stringify(args)}`
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
