import {
  copyFile,
  readdir,
  readFile,
  rename,
  stat,
  writeFile,
} from "fs/promises";
import { basename, dirname, extname, join } from "path";
import { sleep, uuid } from "../../../shared/lib/utils";
import ini from "../../../shared/lib/ini";
import { imagesRoot } from "../../utils/constants";
import { SocketAdaptorInterface } from "../../../shared/socket/socketAdaptorInterface";
import { Job } from "../../../shared/types/types";

const jobs: Job[] = [];

export async function getJob(id: string): Promise<object> {
  const j = jobs.filter((j) => j.id === id);
  if (j.length) {
    if (typeof j[0] === "undefined") debugger;
    return j[0];
  }
  throw new Error("Not Found");
}

function deleteFSJob(this: SocketAdaptorInterface, job: Job) {
  jobs.splice(jobs.indexOf(job), 1);
  this.emit("jobDeleted", job);
}

export async function createFSJob(
  this: SocketAdaptorInterface,
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
    changed: () => {
      this.emit("jobChanged", job);
    },
  };
  jobs.push(job);
  executeJob(job).then(async (updatedFolders: string[]) => {
    this.emit("jobFinished", job);
    if (updatedFolders.length) {
      this.emit("folderChanged", updatedFolders);
    }
    await sleep(10);
    deleteFSJob.bind(this)(job);
  });
  return job.id;
}

async function executeJob(job: Job): Promise<string[]> {
  switch (job.name) {
    case "move":
      return moveJob(job);
      break;
    case "copy":
      return copyJob(job);
      break;
    default:
      job.status = "error";
      job.errors.push(`Unknown job name ${job.name}`);
      break;
  }
  return [];
}

const PICASA = ".picasa.ini";
const THUMBS = ".thumbnails.ini";

function folderChanged(folder: string, list: string[]) {
  if (list.indexOf(folder) === -1) list.push(folder);
}
async function moveJob(job: Job): Promise<string[]> {
  job.status = "started";
  const updatedFolders: string[] = [];
  const source = job.data.source as string[];
  const dest = job.data.destination;
  const steps = source.length;
  job.progress.start = steps;
  job.progress.remaining = steps;
  job.changed();
  await Promise.allSettled(
    source.map(async (s) => {
      try {
        await copyMetadata(s, dest, true);
        await rename(join(imagesRoot, s), join(imagesRoot, dest));
        folderChanged(dirname(s), updatedFolders);
        folderChanged(dest, updatedFolders);
      } catch (e: any) {
        job.errors.push(e.message as string);
      } finally {
        job.progress.remaining--;
      }
    })
  );
  job.status = "done";
  job.changed();
  return updatedFolders;
}

async function copyJob(job: Job): Promise<string[]> {
  job.status = "started";
  const updatedFolders: string[] = [];
  const source = job.data.source as string[];
  const dest = job.data.destination;
  const steps = source.length;
  job.progress.start = steps;
  job.progress.remaining = steps;
  job.changed();
  await Promise.allSettled(
    source.map(async (s) => {
      try {
        await copyFile(join(imagesRoot, s), join(imagesRoot, dest));
        await copyMetadata(s, dest, false);
        folderChanged(dest, updatedFolders);
      } catch (e: any) {
        job.errors.push(e.message as string);
      } finally {
        job.progress.remaining--;
        job.changed();
      }
    })
  );
  job.status = "done";
  job.changed();
  return updatedFolders;
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
  if (await stat(join(imagesRoot, dest, PICASA)).catch((e) => false)) {
    targetIniData = ini.decode(
      await readFile(join(imagesRoot, dest, PICASA), { encoding: "utf-8" })
    );
  }
  if (await stat(join(imagesRoot, dest, THUMBS)).catch((e) => false)) {
    targetThumbData = ini.decode(
      await readFile(join(imagesRoot, dest, THUMBS), { encoding: "utf-8" })
    );
  }

  if (await stat(join(imagesRoot, sourceDir, PICASA)).catch((e) => false)) {
    const iniData = ini.decode(
      await readFile(join(imagesRoot, sourceDir, PICASA), { encoding: "utf-8" })
    );
    targetIniData[file] = iniData[file];
    if (deleteSource) {
      delete iniData[file];
      await writeFile(
        join(imagesRoot, sourceDir, PICASA),
        ini.encode(iniData),
        {
          encoding: "utf-8",
        }
      );
    }
    await writeFile(join(imagesRoot, dest, PICASA), ini.encode(targetIniData), {
      encoding: "utf-8",
    });
  }
  if (await stat(join(imagesRoot, sourceDir, THUMBS)).catch((e) => false)) {
    const iniData = ini.decode(
      await readFile(join(imagesRoot, sourceDir, THUMBS), { encoding: "utf-8" })
    );
    targetThumbData[file] = iniData[file];
    if (deleteSource) {
      delete iniData[file];
      await writeFile(
        join(imagesRoot, sourceDir, THUMBS),
        ini.encode(iniData),
        {
          encoding: "utf-8",
        }
      );
    }
    await writeFile(
      join(imagesRoot, dest, THUMBS),
      ini.encode(targetThumbData),
      {
        encoding: "utf-8",
      }
    );
  }
}
