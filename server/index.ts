import Fastify, { FastifyInstance, RouteShorthandOptions } from "fastify";
import fastifystatic from "fastify-static";
import { readdir, readFile, stat, writeFile } from "fs/promises";
import { Server } from "http";
import { join } from "path";
import WebSocket from "ws";
import { SocketAdaptorInterface } from "./rpc/socket/socketAdaptorInterface";
import { WsAdaptor } from "./rpc/socket/wsAdaptor";
import { RPCInit } from "./rpc/index";
const server: FastifyInstance = Fastify({
  logger: true,
  maxParamLength: 32000,
  bodyLimit: 50 * 1024 * 1024,
});
const imagesRoot = "/Volumes/Photos/Photos";

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
  return new WsAdaptor(serverClient);
}

export function socketInit(httpServer: Server) {
  const wsServer = serverInit(httpServer);
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  wsServer.on("connection", (client: WebSocket) => {
    console.info("[socket]: Client has connected...");
    const socket = socketAdaptorInit(client);

    if (reconnectTimer) clearTimeout(reconnectTimer);

    socket.use((packet: any, next: Function) => {
      // Handler
      // console.debug('Received packet', packet);
      next();
    });

    RPCInit(socket, {});

    socket.onDisconnect((args: CloseEvent) => {
      console.debug(
        "[socket]: Client has disconnected...",
        args ? args.reason : "no specific reason"
      );

      return;
    });
  });
  return { httpServer, wsServer };
}

server.register(fastifystatic, {
  root: join(__dirname, "..", "public"),
  prefix: "/", // optional: default '/',
  setHeaders: (res) => {
    res.setHeader("Cross-Origin-Opener-Policy-Report-Only", "same-origin");
    res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
    res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  },
});

server.get("/ping", pingOpts, async (request, reply) => {
  return { pong: "it worked!" };
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
