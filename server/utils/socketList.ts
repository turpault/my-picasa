import { RPCAdaptorInterface } from "../../shared/rpc-transport/rpc-adaptor-interface";
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
export async function broadcast(msg: string, params: any) {
  rate("broadcast");
  return Promise.allSettled(socketList.map((s) => s.emit(msg, params)));
}
export function socketCount() {
  return socketList.length;
}
