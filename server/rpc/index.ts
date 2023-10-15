import { SocketAdaptorInterface } from "../../shared/socket/socket-adaptor-interface";
import { PicisaClient } from "./my-picasa";
import { registerServices } from "./rpc-handler";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function RPCInit(io: SocketAdaptorInterface, dependencies: {}): void {
  registerServices(io, [PicisaClient], dependencies);
}
