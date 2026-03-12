import fastifystatic from "@fastify/static";
import FastifyWebsocket from "@fastify/websocket";
import Fastify, { FastifyInstance, RouteShorthandOptions } from "fastify";
import { join } from "path";
import { lockedLocks, startLockMonitor } from "../shared/lib/mutex";
import { RPCAdaptorInterface } from "../shared/rpc-transport/rpc-adaptor-interface";
import { WsAdaptor } from "../shared/rpc-transport/ws-adaptor";
import { closePoiDb } from "./services/geolocate/internal/poi/poi-database";
// import { getIndexingService } from "../worker/background/bg-indexing"; // This causes DB initialization on main thread
import { parseLUTs } from "./imageOperations/image-filters";
import { encode } from "./imageOperations/sharp-processor";
import { startAlbumUpdateNotification } from "./rpc/fileAndFolders";
import { initProjects } from "./rpc/projects";
import { RPCInit } from "./rpc/index";
import { asset } from "./rpc/routes/asset";
import { albumThumbnail, thumbnail } from "./rpc/routes/thumbnail";
import { albumWithData } from "./rpc/rpcFunctions/albumUtils";
// initializePicasaIniCache is now called in the walker worker
import { info } from "console";
import { loadFaceAlbums } from "./operations/faces/faces";
import { startSentry } from "./sentry";
import { busy, measureCPULoad } from "./utils/busy";
import { imagesRoot, rootPath } from "./utils/constants";
import { addSocket, removeSocket } from "./utils/socketList";
import { history } from "./utils/stats";
import { initUndo } from "./utils/undo";
import { startWorkers } from "./worker-manager";
// import { startBackgroundTasksOnStart } from "../worker/background/bg-services-on-start";

/** */

// Returns a socket that can be used
function socketAdaptorInit(serverClient: any): RPCAdaptorInterface {
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
    const album = await albumWithData(albumkey);

    if (!album) {
      reply.code(404);
      reply.send();
      return {};
    }
    const animated = (request.query as any)["animated"] !== undefined;

    const r = await albumThumbnail(album, resolution, animated);
    reply.type(r.mime);
    reply.header("cache-control", "no-cache");
    return r.data;
  });

  server.get(
    "/thumbnail/:albumkey/:name/:resolution",
    async (request, reply) => {
      const { albumkey, name, resolution } = request.params as any;
      const album = await albumWithData(albumkey);
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
    const album = await albumWithData(albumkey);
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

const DEFAULT_PORT = 5500;

function resolvePort(p?: number): number {
  if (typeof p === "number" && !Number.isNaN(p)) {
    return p;
  }

  const envPort = process.env.PICISA_PORT;
  if (envPort) {
    const parsed = parseInt(envPort, 10);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }

  return DEFAULT_PORT;
}

export async function startServer(p?: number) {
  try {
    const port = resolvePort(p);
    info(
      `Starting server on port ${port} in folder ${rootPath}. Photos root is ${imagesRoot}`,
    );

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
    await server.ready().then(() =>
      server.listen({ host: "0.0.0.0", port }),
    );
    console.info(`Ready to accept connections on port ${port}.`);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

// Ensure cleanup on exit
process.on('exit', () => {
  closePoiDb();
  // const service = getIndexingService(true);
  // service.close();
});

export async function startServices() {
  await initUndo();
  info("Starting services...");

  // Start all workers
  info("Starting workers...");
  await startWorkers();

  info("Measuring CPU load...");
  measureCPULoad();
  // Picasa ini cache writer is initialized in walker worker
  info("Starting lock monitor...");
  startLockMonitor();
  info("Starting album update notification...");
  startAlbumUpdateNotification();
  // Persons are now fetched from faces service queries, no need to build a list
  info("Starting background tasks...");
  // startBackgroundTasksOnStart();
  info("Parsing LUTs...");
  await parseLUTs();
  info("Initializing projects...");
  await initProjects();
  info("Loading face albums...");
  await loadFaceAlbums();
  info("Waiting until walk...");
  info("Ready...");
}
