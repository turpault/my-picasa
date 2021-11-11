import { SocketAdaptorInterface } from "../../shared/socket/socketAdaptorInterface";

const socketList: SocketAdaptorInterface[] = [];
export function addSocket(socket: SocketAdaptorInterface) {
  socketList.push(socket);
}
export function removeSocket(socket: SocketAdaptorInterface) {
  socketList.splice(socketList.indexOf(socket), 1);
}
export async function broadcast(msg: string, params: any) {
  return Promise.allSettled(socketList.map((s) => s.emit(msg, params)));
}
