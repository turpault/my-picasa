import { SocketAdaptorInterface } from "./socket/socketAdaptorInterface";
import { MyPicasa } from "./my-picasa";
import { registerServices } from "./rpcHandler";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function RPCInit(io: SocketAdaptorInterface, dependencies: {}): void {
  registerServices(io, [MyPicasa], dependencies);
}
