import fastifystatic from "@fastify/static";
import { default as websocketPlugin } from "@fastify/websocket";
import Fastify, { FastifyInstance, RouteShorthandOptions } from "fastify";
import { basename, join } from "path";
import { lockedLocks, startLockMonitor } from "../shared/lib/utils";
import { SocketAdaptorInterface } from "../shared/socket/socketAdaptorInterface";
import { WsAdaptor } from "../shared/socket/wsAdaptor";
import { buildThumbs } from "./rpc/background/bg-thumbgen";
import { encode } from "./rpc/imageOperations/sharp-processor";
import { RPCInit } from "./rpc/index";
import { asset } from "./rpc/routes/asset";
import { thumbnail } from "./rpc/routes/thumbnail";
import { picasaInitCleaner } from "./rpc/rpcFunctions/picasaIni";
import { startAlbumUpdateNotification, updateLastWalkLoop } from "./rpc/rpcFunctions/walker";
import { startSentry } from "./sentry";
import { busy, measureCPULoad } from "./utils/busy";
import { addSocket, removeSocket } from "./utils/socketList";
import { history } from "./utils/stats";

/** */

// Returns a socket that can be used
function socketAdaptorInit(serverClient: any): SocketAdaptorInterface {
  const s = new WsAdaptor();
  s.socket(serverClient);
  return s;
}

export function socketInit(httpServer: FastifyInstance) {

  httpServer.get('/cmd', {websocket: true}, (connection, req) => {
    console.info("[socket]: Client has connected...");
    const socket = socketAdaptorInit(connection.socket);
    addSocket(socket);
    socket.onDisconnect(()=>removeSocket(socket));

    RPCInit(socket, {});

    connection.on('error', () => {
      console.debug("[socket]: Socket had an error...");
      removeSocket(socket);
    });
  });
}

function setupRoutes(server: FastifyInstance) {
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
    reply.header("cache-control", "no-cache");
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
}
const port = Math.floor(Math.random() * 10000 + 5000);

export function getPort() {
  return port;
}

export async function start(p?: number) {
  try {
    if (!p) {
      p = getPort();
    }
    startSentry();
    buildThumbs();
    updateLastWalkLoop();
    measureCPULoad();
    picasaInitCleaner();
    startLockMonitor();
    startAlbumUpdateNotification();
    const server: FastifyInstance = Fastify({
      logger: true,
      maxParamLength: 32000,
      bodyLimit: 50 * 1024 * 1024,
    });

    server.register(fastifystatic, {
      root: join(__dirname, "..", "..", "public"),
      prefix: "/", // optional: default '/',
    });

    server.register(websocketPlugin);
    await socketInit(server);

    server.addHook("preHandler", (request, reply, done) => {
      console.info('request');
      busy();
      done();
    });

    setupRoutes(server);
    await server.listen(p, "localhost");
    console.info(`Ready to accept connections on port ${p}.`);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}
