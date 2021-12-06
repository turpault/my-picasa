import { SocketAdaptorInterface } from "../../shared/socket/socketAdaptorInterface";
import { dec, inc, rate } from "./stats";

const socketList: SocketAdaptorInterface[] = [];
export function addSocket(socket: SocketAdaptorInterface) {
  inc("socket");
  socketList.push(socket);
}
export function removeSocket(socket: SocketAdaptorInterface) {
  dec("socket");
  socketList.splice(socketList.indexOf(socket), 1);
}
export async function broadcast(msg: string, params: any) {
  rate("broadcast");
  return Promise.allSettled(socketList.map((s) => s.emit(msg, params)));
}
