import {
  copyFile,
  readdir,
  readFile,
  rename,
  stat,
  writeFile,
} from "fs/promises";
import { basename, dirname, extname, join } from "path";
import { uuid } from "../../../src/lib/utils";
import ini from "../../../src/lib/ini";

type Job = {
  id: string;
  name: string;
  data: any;
  status: string;
  progress: { start: number; remaining: number };
  errors: string[];
};
const jobs: Job[] = [];

export async function getJob(id: string): Promise<object> {
  const j = jobs.filter((j) => j.id === id);
  if (j.length) {
    if (typeof j[0] === "undefined") debugger;
    return j[0];
  }
  throw new Error("Not Found");
}

export async function createJob(
  jobName: string,
  jobArgs: object
): Promise<string> {
  const job: Job = {
    id: uuid(),
    name: jobName,
    data: jobArgs,
    status: "queued",
    progress: {
      start: 0,
      remaining: 0,
    },
    errors: [],
  };
  jobs.push(job);
  executeJob(job);
  return job.id;
}

function executeJob(job: Job) {
  switch (job.name) {
    case "move":
      moveJob(job);
      break;
    case "copy":
      copyJob(job);
      break;
    default:
      job.status = "error";
      job.errors.push(`Unknown job name ${job.name}`);
      break;
  }
}

const PICASA = ".picasa.ini";
const THUMBS = ".thumbnails.ini";

async function moveJob(job: Job) {
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
}

async function copyJob(job: Job) {
  job.status = "started";
  const source = job.data.source as string;
  const dest = job.data.destination;
  await copyFile(source, dest);
  await copyMetadata(source, dest, false);
  job.status = "done";
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
