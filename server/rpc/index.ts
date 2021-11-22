import { SocketAdaptorInterface } from "../../shared/socket/socketAdaptorInterface.js";
import { MyPicasa } from "./my-picasa.js";
import { registerServices } from "./rpcHandler.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function RPCInit(io: SocketAdaptorInterface, dependencies: {}): void {
  registerServices(io, [MyPicasa], dependencies);
}
