import { WsAdaptor } from "../../shared/socket/wsAdaptor.js";
import { buildEmitter, Emitter } from "../../shared/lib/event.js";
import { sleep } from "../../shared/lib/utils.js";
import { MyPicasa } from "./generated-rpc/MyPicasa.js";
export type ConnectionEvent = {
  connected: { service: MyPicasa };
  disconnected: { event: Event };
};
export function connect(
  port: number,
  address: string,
  ssl: boolean
): Emitter<ConnectionEvent> {
  const events = buildEmitter<ConnectionEvent>();
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
      sleep(10).then(reopen);
    };
    wSocket.onopen = () => {
      try {
        socket.socket(wSocket);
        const service = new MyPicasa();
        service.initialize(socket);
        events.emit("connected", { service });
      } catch (e) {
        sleep(10).then(reopen);
      }
    };
    wSocket.onclose = () => {};
  };
  reopen();
  return events;
}

let ev: Emitter<ConnectionEvent>;
let _connected = false;
let _service: MyPicasa;
export async function getService(): Promise<MyPicasa> {
  if (!ev) {
    ev = connect(5500, "127.0.0.1", false);
    ev.on("connected", ({ service }) => {
      _service = service;
      _connected = true;
    });
    ev.on("disconnected", () => {
      _connected = false;
    });
  }
  if (!_connected) {
    return new Promise<MyPicasa>((resolve) => {
      ev.once("connected", ({ service }) => {
        _connected = true;
        resolve(service);
      });
    });
  }

  return _service;
}
