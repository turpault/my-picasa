import { randomUUID } from "crypto";
import Fastify, { FastifyInstance, RouteShorthandOptions } from "fastify";
import fastifystatic from "fastify-static";
import { PathLike } from "fs";
import {
  copyFile,
  readdir,
  readFile,
  rename,
  stat,
  writeFile,
} from "fs/promises";
import ini from "ini";
import { join } from "path";
import { basename, dirname, extname, relative } from "path/posix";

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

server.register(fastifystatic, {
  root: join(__dirname, "..", "public"),
  prefix: "/", // optional: default '/'
});

server.get("/ping", pingOpts, async (request, reply) => {
  return { pong: "it worked!" };
});

server.get("/file/:file", async (request, reply) => {
  const p = join(imagesRoot, (request.params as any).file);
  try {
    await readFile(p).then((buffer) => reply.send(buffer));
  } catch (e: any) {
    reply.status(404).send(e.message);
  }
});

server.post("/file/:file", async (request, reply) => {
  return writeFile(
    join(imagesRoot, (request.params as any).file),
    request.body as string
  ).then(() => ({
    error: undefined,
  }));
});

server.get("/folder/:folder", async (request, reply) => {
  const p = join(imagesRoot, (request.params as any).folder);
  const data = await readdir(p);
  const stats = await Promise.allSettled(
    data.map((e) =>
      stat(join(p, e)).then((s) => ({
        name: e,
        kind: s.isDirectory() ? "directory" : "file",
      }))
    )
  );
  return stats
    .filter((p) => p.status === "fulfilled")
    .map((p) => (p as any).value);
});

let lastWalk: Album[] | undefined = undefined;
async function updateLastWalk() {
  const f = await walk("", imagesRoot);
  const sorted = f.sort((a, b) =>
    a.name > b.name ? -1 : a.name < b.name ? 1 : 0
  );
  sorted.forEach((p) => (p.path = relative(imagesRoot, p.path)));
  lastWalk = sorted;
}
setInterval(() => updateLastWalk(), 120000);
updateLastWalk();

server.get("/folders", async (request, reply) => {
  if (!lastWalk) {
    await updateLastWalk();
  }
  return lastWalk;
});

const jobOpts: RouteShorthandOptions = {
  schema: {
    response: {
      200: {
        type: "object",
        properties: {
          id: {
            type: "string",
          },
          data: {
            type: "object",
          },
          status: {
            type: "string",
          },
        },
      },
    },
  },
};

type Job = {
  id: string;
  data: any;
  status: string;
  progress: { start: number; remaining: number };
  errors: string[];
};
const jobs: Job[] = [];

server.post("/job", jobOpts, async (request, reply) => {
  const data = request.body;
  const id = randomUUID();
  const job = {
    id,
    data,
    status: "pending",
    errors: [],
    progress: { start: 0, remaining: 0 },
  };
  executeJob(job);
  jobs.push(job);
  return job;
});

server.get("/job/:id", jobOpts, async (request, reply) => {
  const id = (request.params as { id: string }).id;
  const j = jobs.filter((j) => j.id === id);
  if (j.length) {
    if (typeof j[0] === "undefined") debugger;
    return j[0];
  }
  throw new Error("Not Found");
});

const start = async () => {
  try {
    await server.listen(5500);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
};
start();

const PICASA = ".picasa.ini";
const THUMBS = ".thumbnails.ini";
async function executeJob(job: Job) {
  switch (job.data.command) {
    case "move":
      job.status = "started";
      const source = job.data.source as string[];
      const dest = job.data.destination;
      const steps = source.length;
      job.progress.start = steps;
      job.progress.remaining = steps;
      await Promise.allSettled(
        source.map(async (s) => {
          try {
            await copyMetadata(s, dest, true);
            await rename(s, dest);
          } catch (e: any) {
            job.errors.push(e.message as string);
          } finally {
            job.progress.remaining--;
          }
        })
      );
      job.status = "done";
      break;
    case "copy":
      {
        job.status = "started";
        const source = job.data.source as string;
        const dest = job.data.destination;
        await copyFile(source, dest);
        await copyMetadata(source, dest, false);
        job.status = "done";
      }
      job.data;
  }
}

async function copyMetadata(
  source: string,
  dest: string,
  deleteSource: boolean = false
) {
  const sourceDir = dirname(source);
  const file = basename(source);
  let targetIniData: { [key: string]: any } = {};
  let targetThumbData: { [key: string]: any } = {};
  if (await stat(join(dest, PICASA)).catch((e) => false)) {
    targetIniData = ini.decode(
      await readFile(join(dest, PICASA), { encoding: "utf-8" })
    );
  }
  if (await stat(join(dest, THUMBS)).catch((e) => false)) {
    targetThumbData = ini.decode(
      await readFile(join(dest, THUMBS), { encoding: "utf-8" })
    );
  }

  if (await stat(join(sourceDir, PICASA)).catch((e) => false)) {
    const iniData = ini.decode(
      await readFile(join(sourceDir, PICASA), { encoding: "utf-8" })
    );
    targetIniData[file] = iniData[file];
    if (deleteSource) {
      delete iniData[file];
      await writeFile(join(sourceDir, PICASA), ini.encode(iniData), {
        encoding: "utf-8",
      });
    }
    await writeFile(join(dest, PICASA), ini.encode(targetIniData), {
      encoding: "utf-8",
    });
  }
  if (await stat(join(sourceDir, THUMBS)).catch((e) => false)) {
    const iniData = ini.decode(
      await readFile(join(sourceDir, THUMBS), { encoding: "utf-8" })
    );
    targetThumbData[file] = iniData[file];
    if (deleteSource) {
      delete iniData[file];
      await writeFile(join(sourceDir, THUMBS), ini.encode(iniData), {
        encoding: "utf-8",
      });
    }
    await writeFile(join(dest, THUMBS), ini.encode(targetThumbData), {
      encoding: "utf-8",
    });
  }
}

type Album = {
  name: string;
  path: string;
};
const pictureExtensions = ["jpeg", "jpg", "png", "gif"];
const videoExtensions = ["mp4", "mov"];

export async function walk(name: string, path: string): Promise<Album[]> {
  const items = await readdir(path);
  const hasPics = items.find((item) => {
    const ext = extname(item).toLowerCase().replace(".", "");
    return (
      (pictureExtensions.includes(ext) || videoExtensions.includes(ext)) &&
      !item.startsWith(".")
    );
  });
  const stats = await Promise.all(items.map((item) => stat(join(path, item))));

  const folders: { name: string; path: string }[] = [];
  let idx = 0;
  for (const item of items) {
    if (stats[idx].isDirectory() && !item.startsWith(".")) {
      folders.push({ name: items[idx], path: join(path, items[idx]) });
    }
    idx++;
  }
  const p = await Promise.all(
    folders.map((folder) => walk(folder.name, folder.path))
  );

  const all = p.flat();
  if (hasPics) {
    all.push({ name, path });
  }
  return all;
}
