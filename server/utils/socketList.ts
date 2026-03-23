import { RPCAdaptorInterface } from "../../shared/rpc-transport/rpc-adaptor-interface";
import { events } from "../../shared/server-events";
import { dec, inc, rate } from "./stats";

const socketList: RPCAdaptorInterface[] = [];
export function addSocket(socket: RPCAdaptorInterface) {
  inc("socket");
  socketList.push(socket);
}
export function removeSocket(socket: RPCAdaptorInterface) {
  dec("socket");
  socketList.splice(socketList.indexOf(socket), 1);
}
export function socketCount() {
  return socketList.length;
}
let clientEventForwardingInstalled = false;

export function setupClientEventForwarding() {
  if (clientEventForwardingInstalled) {
    return;
  }
  clientEventForwardingInstalled = true;
  events.on("*", (eventType: string, data: any) => {
    broadcast("serverEvent", { eventType, data });
  });
}
async function broadcast(msg: string, params: any) {
  rate("broadcast");
  return Promise.allSettled(socketList.map((s) => s.emit(msg, params)));
}
