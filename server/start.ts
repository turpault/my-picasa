import fastifystatic from "@fastify/static";
import FastifyWebsocket from "@fastify/websocket";
import Fastify, { FastifyInstance, RouteShorthandOptions } from "fastify";
import { join } from "path";
import { lockedLocks, startLockMonitor } from "../shared/lib/mutex";
import { SocketAdaptorInterface } from "../shared/socket/socket-adaptor-interface";
import { WsAdaptor } from "../shared/socket/ws-adaptor";
import { updateLastWalkLoop, waitUntilWalk } from "./walker";
import { parseLUTs } from "./imageOperations/image-filters";
import { encode } from "./imageOperations/sharp-processor";
import { startAlbumUpdateNotification } from "./rpc/albumTypes/fileAndFolders";
import { initProjects } from "./rpc/albumTypes/projects";
import { RPCInit } from "./rpc/index";
import { asset } from "./rpc/routes/asset";
import { albumThumbnail, thumbnail } from "./rpc/routes/thumbnail";
import { albumWithData } from "./rpc/rpcFunctions/albumUtils";
import { picasaIniCacheWriter } from "./rpc/rpcFunctions/picasa-ini";
import { startSentry } from "./sentry";
import { busy, measureCPULoad } from "./utils/busy";
import { addSocket, removeSocket } from "./utils/socketList";
import { history } from "./utils/stats";
import { loadFaceAlbums } from "./rpc/rpcFunctions/faces";
import { info } from "console";
import { initUndo } from "./utils/undo";
import { buildPersonsList } from "./rpc/albumTypes/persons";

/** */

// Returns a socket that can be used
function socketAdaptorInit(serverClient: any): SocketAdaptorInterface {
  const s = new WsAdaptor();
  s.socket(serverClient);
  return s;
}

export function socketInit(httpServer: FastifyInstance) {
  httpServer.register(async function (fastify) {
    fastify.get("/cmd", { websocket: true }, (connection, req) => {
      console.info("[socket]: Client has connected...");
      const socket = socketAdaptorInit(connection);
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

  server.get("/thumbnail/:albumkey/:resolution", async (request, reply) => {
    const { albumkey, resolution } = request.params as any;
    const album = albumWithData(albumkey);

    if (!album) {
      reply.code(404);
      reply.send();
      return {};
    }
    const animated = (request.query as any)["animated"] !== undefined;
    3;

    const r = await albumThumbnail(album, resolution, animated);
    reply.type(r.mime);
    reply.header("cache-control", "no-cache");
    return r.data;
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
    },
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

export async function startServer(p?: number) {
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
      root: join(__dirname, "..", "public"),
      prefix: "/", // optional: default '/',
    });
    server.register(FastifyWebsocket);
    await socketInit(server);

    server.addHook("preHandler", (request, reply, done) => {
      busy();
      done();
    });

    setupRoutes(server);
    await server.ready().then(() => server.listen({ port: p }));
    console.info(`Ready to accept connections on port ${p}.`);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}
export async function startServices() {
  await initUndo();
  info("Starting services...");
  updateLastWalkLoop();
  info("Measuring CPU load...");
  measureCPULoad();
  info("Starting picasa ini cache writer...");
  picasaIniCacheWriter();
  info("Starting lock monitor...");
  startLockMonitor();
  info("Starting album update notification...");
  startAlbumUpdateNotification();
  info("Fetch persons list...");
  buildPersonsList();
  info("Parsing LUTs...");
  await parseLUTs();
  info("Initializing projects...");
  await initProjects();
  info("Loading face albums...");
  await loadFaceAlbums();
  info("Waiting until walk...");
  await waitUntilWalk();
  info("Ready...");
}
