import { SocketAdaptorInterface } from "../../shared/socket/socketAdaptorInterface";
import { WsAdaptor } from "../../shared/socket/wsAdaptor";
import { MyPicasa } from "../rpc/generated-rpc/MyPicasa";
export async function connect(
  port: number,
  address: string,
  ssl: boolean,
  handlerMap: { [action: string]: Function }
): Promise<{ service: MyPicasa; socket: SocketAdaptorInterface }> {
  const wSocket = new WebSocket(
    `${ssl ? "wss://" : "ws://"}${address}:${port}/cs`
  );
  return new Promise((resolve, reject) => {
    wSocket.onerror = (error) => {
      reject(error);
    };
    wSocket.onopen = () => {
      try {
        const socket = new WsAdaptor(wSocket);
        socket.handlerMap = handlerMap;

        const service = new MyPicasa();
        service.initialize(socket);
        resolve({ service, socket });
      } catch (e) {
        console.log(e);
        reject();
      }
    };
  });
}

export async function makeEventSource(
  port: number,
  address: string,
  ssl: boolean,
  cb: (type: string, payload: object) => {}
): Promise<{ service: MyPicasa; socket: SocketAdaptorInterface }> {
  const { service, socket } = await connect(port, address, ssl, {
    message: (payload: object) => {
      cb("message", payload);
    },
  });
  return { service, socket };
}
