import { buildEmitter, Emitter } from "../../shared/lib/event";
import { sleep } from "../../shared/lib/utils";
import { createRPCClient } from "../../shared/rpc-transport/create-rpc-client";
import { WsAdaptor } from "../../shared/rpc-transport/ws-adaptor";
import { events, ServerEvents } from "../../shared/server-events";
import {
  PICISA_METHODS,
  PICISA_PARAM_NAMES,
  type PicisaClientApi,
} from "../../shared/rpc-contracts";

export type ConnectionEvent = {
  connected: { service: PicisaClientApi };
  disconnected: { event: Event };
};
export function connect(
  port: number,
  address: string,
  ssl: boolean,
): Emitter<ConnectionEvent> {
  const events = buildEmitter<ConnectionEvent>(false);
  const socket = new WsAdaptor();
  let opening = false;
  const reopen = async (delay: number = 0) => {
    opening = true;
    if (delay) await sleep(delay);

    const wSocket = new WebSocket(
      `${ssl ? "wss://" : "ws://"}${address}:${port}/cmd`,
    );
    wSocket.onerror = (event: Event) => {
      if (opening) {
        return; // ignore errors while opening
      }
      events.emit("disconnected", { event });
      try {
        wSocket.close();
      } catch (e) { }
      reopen(1);
    };
    wSocket.onopen = () => {
      opening = false;
      try {
        socket.socket(wSocket);
        const service = createRPCClient<PicisaClientApi>(
          socket,
          "PicisaClient",
          PICISA_METHODS,
          PICISA_PARAM_NAMES
        );
        events.emit("connected", { service });
      } catch (e) {
        reopen(10);
      }
    };
    wSocket.onclose = () => { };
  };
  reopen();
  return events;
}

let ev: Emitter<ConnectionEvent>;
let _connected = false;
let _service: PicisaClientApi;

let _servicePort = 5500;
export function setServicePort(port: number) {
  _servicePort = port;
}
export function getServicePort() {
  return _servicePort;
}

/**
 * Wire PicisaClient push messages (action "serverEvent") into the shared client event bus.
 * The transport delivers { payload: { eventType, data }, callback } per incoming RPC envelope.
 */
export function attachServerEventBridge(service: PicisaClientApi): void {
  service.on("serverEvent", (msg: unknown) => {
    const envelope = msg as {
      payload?: { eventType?: string; data?: unknown };
      callback?: (err: string | null, result?: unknown) => void;
    };
    const p = envelope.payload;
    if (p && typeof p.eventType === "string") {
      events.emit(p.eventType as keyof ServerEvents, p.data as never);
    }
    try {
      envelope.callback?.(null, {});
    } catch {
      /* ignore */
    }
  });
}

export async function getService(): Promise<PicisaClientApi> {
  if (!ev) {
    ev = connect(getServicePort(), location.hostname || "localhost", false);
    ev.on("connected", ({ service }) => {
      _service = service;
      _connected = true;
    });
    ev.on("disconnected", () => {
      _connected = false;
    });
  }
  if (!_connected) {
    return new Promise<PicisaClientApi>((resolve) => {
      ev.once("connected", ({ service }) => {
        attachServerEventBridge(service);
        _connected = true;
        resolve(service);
      });
    });
  }

  return _service;
}
