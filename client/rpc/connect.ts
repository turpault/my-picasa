import { buildEmitter, Emitter } from "../../shared/lib/event";
import { sleep } from "../../shared/lib/utils";
import { WsAdaptor } from "../rpc-transport/ws-adaptor";
import { PicisaClient } from "./generated-rpc/PicisaClient";
export type ConnectionEvent = {
  connected: { service: PicisaClient };
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
      } catch (e) {}
      reopen(1);
    };
    wSocket.onopen = () => {
      opening = false;
      try {
        socket.socket(wSocket);
        const service = new PicisaClient();
        service.initialize(socket);
        events.emit("connected", { service });
      } catch (e) {
        reopen(10);
      }
    };
    wSocket.onclose = () => {};
  };
  reopen();
  return events;
}

let ev: Emitter<ConnectionEvent>;
let _connected = false;
let _service: PicisaClient;

let _servicePort = 5500;
export function setServicePort(port: number) {
  _servicePort = port;
}
export function getServicePort() {
  return _servicePort;
}

export async function getService(): Promise<PicisaClient> {
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
    return new Promise<PicisaClient>((resolve) => {
      ev.once("connected", ({ service }) => {
        _connected = true;
        resolve(service);
      });
    });
  }

  return _service;
}
