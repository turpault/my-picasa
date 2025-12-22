import { RPCAdaptorInterface } from "../../shared/rpc-transport/rpc-adaptor-interface";
import { PicisaClient } from "./my-picasa";
import { registerServices } from "./rpc-handler";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function RPCInit(io: RPCAdaptorInterface, dependencies: {}): void {
  registerServices(io, [PicisaClient], dependencies);
}
