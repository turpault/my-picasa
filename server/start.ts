import Fastify, { FastifyInstance, RouteShorthandOptions } from "fastify";
import fastifystatic from "fastify-static";
import { Server } from "http";
import { basename, join } from "path";
import WebSocket from "ws";
import { lockedLocks } from "../shared/lib/utils.js";
import { SocketAdaptorInterface } from "../shared/socket/socketAdaptorInterface.js";
import { WsAdaptor } from "../shared/socket/wsAdaptor.js";
import { buildThumbs } from "./rpc/background/bg-thumbgen.js";
import { encode } from "./rpc/imageOperations/sharp-processor.js";
import { RPCInit } from "./rpc/index.js";
import { asset } from "./rpc/routes/asset.js";
import { thumbnail } from "./rpc/routes/thumbnail.js";
import { picasaInitCleaner } from "./rpc/rpcFunctions/picasaIni.js";
import { updateLastWalkLoop } from "./rpc/rpcFunctions/walker.js";
import { busy } from "./utils/busy.js";
import { addSocket, removeSocket } from "./utils/socketList.js";
import { history } from "./utils/stats.js";
const server: FastifyInstance = Fastify({
  //logger: true,
  maxParamLength: 32000,
  bodyLimit: 50 * 1024 * 1024,
});

server.register(fastifystatic, {
  root: join(__dirname, "..", "..", "public"),
  prefix: "/", // optional: default '/',
});
server.addHook("preHandler", (request, reply, done) => {
  busy();
  done();
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

    client.onerror = () => {
      console.debug("[socket]: Socket had an error...");
      removeSocket(socket);
    };
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
  reply.type(mime);
  return encode(context, mime).then((r) => r.data);
});

server.get("/stats", async (request, reply) => {
  return { series: await history(), locks: lockedLocks() };
});

server.get("/thumbnail/:album/:name/:resolution", async (request, reply) => {
  const { album, name, resolution } = request.params as any;
  const entry = {
    album: { key: album, name: basename(album) },
    name,
  };

  const r = await thumbnail(entry, resolution);
  reply.type(r.mime);
  return r.data;
});

server.get("/asset/:album/:name", async (request, reply) => {
  const { album, name } = request.params as any;
  const entry = {
    album: { key: album, name: "" },
    name,
  };

  const file = await asset(entry);
  await reply.sendFile(file, "/");
});

const port = Math.floor(Math.random() * 10000 + 5000);
export function getPort() {
  return port;
}

export async function start(p?: number) {
  try {
    if (!p) {
      p = getPort();
    }
    buildThumbs();
    updateLastWalkLoop();
    picasaInitCleaner();
    await server.listen(p);
    await socketInit(server.server);
    console.info(`Ready to accept connections on port ${p}.`);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}
