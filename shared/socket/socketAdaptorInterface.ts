import EventEmitter from 'events';

export interface SocketAdaptorInterface {
  // Use a middleware function on each incoming packet
  use(middlewareHandler: (data: any, next: Function) => void): void;

  // Set an event handler for a given action which will take in a payload and send a response via a callback
  on(
    action: string,
    callback: (payload: any, callback: Function) => void
  ): Function;

  // Emit a message out to the other end of the socket, and will receive the response via the callback
  emit(
    action: string,
    payload: string | object,
    callback?: (err: string, payload: any) => void
  ): Promise<void>;

  // Set an event handler for when a disconnect occurs on the socket
  onDisconnect(callback: any): void;

  // Disconnect from the other end of the socket
  disconnect(): void;

  // true when closed
  closed: boolean;
}

export const networkEventEmitter = new EventEmitter();
