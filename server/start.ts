import fastifystatic from "@fastify/static";
import { default as websocketPlugin } from "@fastify/websocket";
import Fastify, { FastifyInstance, RouteShorthandOptions } from "fastify";
import { join } from "path";
import { lockedLocks, startLockMonitor } from "../shared/lib/utils";
import { SocketAdaptorInterface } from "../shared/socket/socket-adaptor-interface";
import { WsAdaptor } from "../shared/socket/ws-adaptor";
import { keepFaceAlbumUpdated, scanFaces } from "./rpc/albumTypes/faces";
import { initProjects } from "./rpc/albumTypes/projects";
import { RPCInit } from "./rpc/index";
import { asset } from "./rpc/routes/asset";
import { thumbnail } from "./rpc/routes/thumbnail";
import { albumWithData } from "./rpc/rpcFunctions/albumUtils";
import { picasaIniCleaner } from "./rpc/rpcFunctions/picasa-ini";
import { startSentry } from "./sentry";
import { busy, measureCPULoad } from "./utils/busy";
import { addSocket, removeSocket } from "./utils/socketList";
import { history } from "./utils/stats";
import { encode } from "./imageOperations/sharp-processor";
import { buildThumbs } from "./background/bg-thumbgen";
import { buildGeolocation } from "./background/bg-geolocate";
import { updateLastWalkLoop, waitUntilWalk } from "./background/bg-walker";
import { parseLUTs } from "./imageOperations/image-filters";
import { buildFavoriteFolder } from "./background/bg-favorites";
import { startAlbumUpdateNotification } from "./rpc/albumTypes/fileAndFolders";

/** */

// Returns a socket that can be used
function socketAdaptorInit(serverClient: any): SocketAdaptorInterface {
  const s = new WsAdaptor();
  s.socket(serverClient);
  return s;
}

export function socketInit(httpServer: FastifyInstance) {
  httpServer.get("/cmd", { websocket: true }, (connection, req) => {
    console.info("[socket]: Client has connected...");
    const socket = socketAdaptorInit(connection.socket);
    addSocket(socket);
    socket.onDisconnect(() => {
      removeSocket(socket);
    });

    RPCInit(socket, {});

    connection.on("error", () => {
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

  server.get(
    "/thumbnail/:albumkey/:name/:resolution",
    async (request, reply) => {
      const { albumkey, name, resolution } = request.params as any;
      const album = albumWithData(albumkey);
      if (!album) {
        reply.code(404);
        reply.send();
        return {};
      }
      const entry = {
        album,
        name,
      };
      const animated = (request.query as any)["animated"] !== undefined;

      const r = await thumbnail(entry, resolution, animated);
      reply.type(r.mime);
      reply.header("cache-control", "no-cache");
      return r.data;
    }
  );

  server.get("/asset/:albumkey/:name", async (request, reply) => {
    const { albumkey, name } = request.params as any;
    const album = albumWithData(albumkey);
    if (!album) {
      reply.code(404);
      reply.send();
      return;
    }
    const entry = {
      album,
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
    // No port specified, get a random one
    if (!p) {
      p = getPort();
    }
    startSentry();
    const server: FastifyInstance = Fastify({
      //logger: true,
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
      busy();
      done();
    });

    setupRoutes(server);
    await server.listen({ port: p });
    console.info(`Ready to accept connections on port ${p}.`);

    buildThumbs();
    buildGeolocation();
    updateLastWalkLoop();
    measureCPULoad();
    picasaIniCleaner();
    startLockMonitor();
    startAlbumUpdateNotification();
    keepFaceAlbumUpdated();
    parseLUTs();
    initProjects();
    buildFavoriteFolder();
    await waitUntilWalk();
    await scanFaces();
    console.info("Initial walk complete.");
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}
