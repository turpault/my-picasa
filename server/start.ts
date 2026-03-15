/// <reference types="bun-types" />
import { join, resolve, sep } from "path";
import { existsSync } from "fs";
import { Queue } from "../shared/lib/queue";
import { lockedLocks, startLockMonitor } from "../shared/lib/mutex";
import { RPCAdaptorInterface } from "../shared/rpc-transport/rpc-adaptor-interface";
import { WsAdaptor } from "../shared/rpc-transport/ws-adaptor";
import { closePoiDb } from "./services/geolocate/internal/poi/poi-database";
import { parseLUTs } from "./imageOperations/image-filters";
import { encode } from "./imageOperations/sharp-processor";
import { startAlbumUpdateNotification } from "./rpc/fileAndFolders";
import { initProjects } from "./rpc/projects";
import { RPCInit } from "./rpc/index";
import { asset } from "./rpc/routes/asset";
import { albumThumbnail, thumbnail } from "./rpc/routes/thumbnail";
import { albumWithData } from "./rpc/rpcFunctions/albumUtils";
import { info } from "console";
import { loadFaceAlbums } from "./operations/faces/faces";
import { startSentry } from "./sentry";
import { busy, measureCPULoad } from "./utils/busy";
import { imagesRoot, rootPath } from "./utils/constants";
import { addSocket, removeSocket } from "./utils/socketList";
import { history } from "./utils/stats";
import { initUndo } from "./utils/undo";
import { startWorkers } from "./worker-manager";

import indexHtml from "../public/index.html";

type BunServerWebSocket = import("bun").ServerWebSocket<unknown>;

interface WsWrapper {
  readyState: number;
  send(data: string | Buffer): void;
  close(): void;
  onmessage?: (event: { data: string | Buffer }) => void;
  onclose?: () => void;
  onerror?: (event: unknown) => void;
}

const publicDir = join(process.cwd(), "public");
const distDir = join(publicDir, "dist");
const DEFAULT_PORT = 5500;

/** LIFO queue so most recent requests are served first for faster response when scrolling. */
const httpRequestQueue = new Queue(64, { fifo: false });

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

/** Create a WebSocket-like wrapper for Bun's ServerWebSocket so WsAdaptor receives send, onmessage, onclose, readyState. */
function createBunWsWrapper(bunWs: BunServerWebSocket): WsWrapper {
  const wrapper: WsWrapper = {
    readyState: 1,
    send(data: string | Buffer) {
      bunWs.send(data);
    },
    close() {
      wrapper.readyState = 3;
      bunWs.close();
    },
    onmessage: undefined,
    onclose: undefined,
    onerror: undefined,
  };
  return wrapper;
}

function socketAdaptorInit(serverClient: WsWrapper | WebSocket): RPCAdaptorInterface {
  const s = new WsAdaptor();
  s.socket(serverClient as WebSocket);
  return s;
}

/** Safe path under publicDir; returns null if path escapes. */
function safePublicPath(pathname: string): string | null {
  const normalized = pathname.replace(/^\/+/, "") || "index.html";
  const resolved = resolve(publicDir, normalized);
  const publicResolved = resolve(publicDir);
  if (
    resolved !== publicResolved &&
    !resolved.startsWith(publicResolved + sep)
  ) {
    return null;
  }
  return resolved;
}

export async function startServer(p?: number) {
  try {
    const port = resolvePort(p);
    info(
      `Starting server on port ${port} in folder ${rootPath}. Photos root is ${imagesRoot}`,
    );

    startSentry();

    const server = Bun.serve({
      hostname: "0.0.0.0",
      port,
      maxRequestBodySize: 50 * 1024 * 1024,
      development: process.env.NODE_ENV !== "production",
      routes: {
        "/": indexHtml,
        "/ping": () => Response.json({ pong: "it worked!" }),
        "/stats": async () =>
          Response.json({ series: await history(), locks: lockedLocks() }),
        "/encode/:context/:mime": async (req) =>
          httpRequestQueue.add(async () => {
            const { context, mime } = req.params;
            const r = await encode(
              context,
              mime as "image/jpeg" | "image/png" | "image/webp",
            );
            const body =
              r.data instanceof Buffer ? new Uint8Array(r.data) : r.data;
            return new Response(body, {
              headers: { "Content-Type": mime },
            });
          }),
        "/thumbnail/:albumkey/:name/:resolution": async (req) =>
          httpRequestQueue.add(async () => {
            const { albumkey, name, resolution } = req.params;
            const album = await albumWithData(albumkey);
            if (!album) return new Response(null, { status: 404 });
            const entry = { album, name };
            const url = new URL(req.url);
            const animated = url.searchParams.has("animated");
            const r = await thumbnail(
              entry,
              resolution as "th-small" | "th-medium" | "th-large",
              animated,
            );
            const body =
              r.data instanceof Buffer ? new Uint8Array(r.data) : r.data;
            return new Response(body, {
              headers: {
                "Content-Type": r.mime,
                "Cache-Control": "no-cache",
              },
            });
          }),
        "/thumbnail/:albumkey/:resolution": async (req) =>
          httpRequestQueue.add(async () => {
            const { albumkey, resolution } = req.params;
            const album = await albumWithData(albumkey);
            if (!album) return new Response(null, { status: 404 });
            const url = new URL(req.url);
            const animated = url.searchParams.has("animated");
            const r = await albumThumbnail(
              album,
              resolution as "th-small" | "th-medium" | "th-large",
              animated,
            );
            const body =
              r.data instanceof Buffer ? new Uint8Array(r.data) : r.data;
            return new Response(body, {
              headers: {
                "Content-Type": r.mime,
                "Cache-Control": "no-cache",
              },
            });
          }),
        "/asset/:albumkey/:name": async (req) =>
          httpRequestQueue.add(async () => {
            const { albumkey, name } = req.params;
            const album = await albumWithData(albumkey);
            if (!album) return new Response(null, { status: 404 });
            const entry = { album, name };
            const filePath = await asset(entry);
            const file = Bun.file(filePath);
            const exists = await file.exists();
            if (!exists) return new Response(null, { status: 404 });
            return new Response(file, {
              headers: {
                "Content-Type": filePath.toLowerCase().match(/\.(mp4|webm|mov|avi)$/)
                  ? "video/mp4"
                  : "image/jpeg",
              },
            });
          }),
      },
      async fetch(req, server) {
        busy();
        const pathname = new URL(req.url).pathname;

        if (req.headers.get("upgrade") === "websocket" && pathname === "/cmd") {
          const success = server.upgrade(req);
          if (success) return undefined as unknown as Response;
          return new Response("Expected WebSocket", { status: 400 });
        }

        const distRel = pathname.replace(/^\/+/, "").replace(/\/+/g, "/");
        if (distRel && !distRel.includes("..")) {
          const distPath = resolve(distDir, distRel);
          if (distPath.startsWith(resolve(distDir)) && existsSync(distPath)) {
            return new Response(Bun.file(distPath));
          }
        }

        const filePath = safePublicPath(pathname);
        if (filePath && existsSync(filePath)) {
          return new Response(Bun.file(filePath));
        }
        return new Response("Not Found", { status: 404 });
      },
      websocket: {
        open(ws) {
          console.info("[socket]: Client has connected...");
          const wrapper = createBunWsWrapper(ws);
          const socket = socketAdaptorInit(wrapper);
          addSocket(socket);
          socket.onDisconnect(() => {
            removeSocket(socket);
          });
          RPCInit(socket, {});

          (ws as unknown as { _wrapper: WsWrapper })._wrapper = wrapper;
        },
        message(ws, data) {
          const w = (ws as unknown as { _wrapper: WsWrapper })._wrapper;
          if (w?.onmessage) {
            w.onmessage(
              typeof data === "string" ? { data } : { data: String(data) },
            );
          }
        },
        close(ws) {
          const w = (ws as unknown as { _wrapper: WsWrapper })._wrapper;
          if (w) {
            w.readyState = 3;
            w.onclose?.();
          }
        },
      },
    });

    console.info(`Ready to accept connections on port ${port}.`);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

process.on("exit", () => {
  closePoiDb();
});

export async function startServices() {
  await initUndo();
  info("Starting services...");

  info("Starting workers...");
  await startWorkers();

  info("Measuring CPU load...");
  measureCPULoad();
  info("Starting lock monitor...");
  startLockMonitor();
  info("Starting album update notification...");
  startAlbumUpdateNotification();
  info("Starting background tasks...");
  info("Parsing LUTs...");
  await parseLUTs();
  info("Initializing projects...");
  await initProjects();
  info("Loading face albums...");
  await loadFaceAlbums();
  info("Waiting until walk...");
  info("Ready...");
}
