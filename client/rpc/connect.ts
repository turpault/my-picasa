import { buildEmitter, Emitter } from "../../shared/lib/event";
import { sleep } from "../../shared/lib/utils";
import { WsAdaptor } from "../../shared/socket/ws-adaptor";
import { PicasaClient } from "./generated-rpc/PicasaClient";
export type ConnectionEvent = {
  connected: { service: PicasaClient };
  disconnected: { event: Event };
};
export function connect(
  port: number,
  address: string,
  ssl: boolean
): Emitter<ConnectionEvent> {
  const events = buildEmitter<ConnectionEvent>(false);
  const socket = new WsAdaptor();
  const reopen = () => {
    const wSocket = new WebSocket(
      `${ssl ? "wss://" : "ws://"}${address}:${port}/cmd`
    );
    wSocket.onerror = (event: Event) => {
      events.emit("disconnected", { event });
      try {
        wSocket.close();
      } catch (e) {}
      sleep(1).finally(reopen);
    };
    wSocket.onopen = () => {
      try {
        socket.socket(wSocket);
        const service = new PicasaClient();
        service.initialize(socket);
        events.emit("connected", { service });
      } catch (e) {
        sleep(10).finally(reopen);
      }
    };
    wSocket.onclose = () => {};
  };
  reopen();
  return events;
}

let ev: Emitter<ConnectionEvent>;
let _connected = false;
let _service: PicasaClient;

let _servicePort = 5500;
export function setServicePort(port: number) {
  _servicePort = port;
}
export function getServicePort() {
  return _servicePort;
}

export async function getService(): Promise<PicasaClient> {
  if (!ev) {
    ev = connect(getServicePort(), "localhost", false);
    ev.on("connected", ({ service }) => {
      _service = service;
      _connected = true;
    });
    ev.on("disconnected", () => {
      _connected = false;
    });
  }
  if (!_connected) {
    return new Promise<PicasaClient>((resolve) => {
      ev.once("connected", ({ service }) => {
        _connected = true;
        resolve(service);
      });
    });
  }

  return _service;
}
