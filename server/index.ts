import Fastify, { FastifyInstance, RouteShorthandOptions } from "fastify";
import fastifystatic from "fastify-static";
import { Server } from "http";
import { join } from "path";
import WebSocket from "ws";
import { SocketAdaptorInterface } from "../shared/socket/socketAdaptorInterface";
import { WsAdaptor } from "../shared/socket/wsAdaptor";
import { RPCInit } from "./rpc/index";
import { thumbnail } from "./rpc/routes/thumbnail";
import { encode } from "./rpc/rpcFunctions/sharp-processor";
import { addSocket, removeSocket } from "./utils/socketList";
const server: FastifyInstance = Fastify({
  //logger: true,
  maxParamLength: 32000,
  bodyLimit: 50 * 1024 * 1024,
});

server.register(fastifystatic, {
  root: join(__dirname, "..", "..", "public"),
  prefix: "/", // optional: default '/',
});

const pingOpts: RouteShorthandOptions = {
  schema: {
    response: {
      200: {
        type: "object",
        properties: {
          pong: {
            type: "string",
          },
        },
      },
    },
  },
};
/** */

// Initializes the server to use, depending on the socket implementation
function serverInit(httpServer: Server): WebSocket.Server {
  const wsServer = new WebSocket.Server({ server: httpServer, path: "/cmd" });
  return wsServer;
}

// Returns a socket that can be used
function socketAdaptorInit(serverClient: any): SocketAdaptorInterface {
  const s = new WsAdaptor();
  s.socket(serverClient);
  return s;
}

export function socketInit(httpServer: Server) {
  const wsServer = serverInit(httpServer);

  wsServer.on("connection", (client: WebSocket) => {
    console.info("[socket]: Client has connected...");
    const socket = socketAdaptorInit(client);
    addSocket(socket);

    RPCInit(socket, {});

    socket.onDisconnect((args: CloseEvent) => {
      console.debug(
        "[socket]: Client has disconnected...",
        args ? args.reason : "no specific reason"
      );
      removeSocket(socket);

      return;
    });
  });
  return { httpServer, wsServer };
}

server.get("/ping", pingOpts, async (request, reply) => {
  return { pong: "it worked!" };
});

server.get("/encode/:context/:mime", async (request, reply) => {
  const { context, mime } = request.params as any;
  return encode(context, mime);
});

server.get("/thumbnail/:album/:name/:resolution", async (request, reply) => {
  const { album, name, resolution } = request.params as any;
  const entry = {
    album: { key: album, name: "" },
    name,
  };
  return thumbnail(entry, resolution);
});

const start = async () => {
  try {
    await server.listen(5500);
    await socketInit(server.server);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
};
start();
