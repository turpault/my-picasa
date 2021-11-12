import { copyFile, mkdir, rename, stat } from "fs/promises";
import { extname, join } from "path";
import { basename } from "path/posix";
import { sleep, uuid } from "../../../shared/lib/utils";
import { SocketAdaptorInterface } from "../../../shared/socket/socketAdaptorInterface";
import { Album, AlbumEntry, Job } from "../../../shared/types/types";
import { openExplorer } from "../../open";
import { exportsRoot, imagesRoot } from "../../utils/constants";
import { broadcast } from "../../utils/socketList";
import { exportToFolder } from "../imageOperations/export";
import { readPicasaIni, writePicasaIni } from "./picasaIni";
import {
  deleteImageFileMetas,
  readImageFileMetas,
  writeImageFileMetas,
} from "./thumbnailIni";
import { invalidateCachedFolderList } from "./walker";

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
  broadcast("jobDeleted", job);
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
      broadcast("jobChanged", job);
    },
  };
  jobs.push(job);
  executeJob(job)
    .then(async (updatedAlbums: Album[]) => {
      broadcast("jobFinished", job);
      if (updatedAlbums.length) {
        invalidateCachedFolderList();
        broadcast("albumChanged", updatedAlbums);
      }
    })
    .catch((err: Error) => {
      job.errors.push(err.message);
      job.status = "finished";
    })
    .finally(async () => {
      await sleep(10);
      deleteFSJob.bind(this)(job);
    });
  return job.id;
}

async function executeJob(job: Job): Promise<Album[]> {
  switch (job.name) {
    case "move":
      return moveJob(job);
    case "copy":
      return copyJob(job);
    case "duplicate":
      return duplicateJob(job);
    case "export":
      return exportJob(job);
    case "delete":
      return deleteJob(job);
    default:
      job.status = "finished";
      job.errors.push(`Unknown job name ${job.name}`);
      break;
  }
  return [];
}

function albumChanged(album: Album, list: Album[]) {
  if (!list.find((a) => a.key === album.key)) list.push(album);
}
async function moveJob(job: Job): Promise<Album[]> {
  job.status = "started";
  const updatedAlbums: Album[] = [];
  const source = job.data.source as AlbumEntry[];
  const dest = job.data.destination as Album;
  const steps = source.length;
  job.progress.start = steps;
  job.progress.remaining = steps;
  job.changed();
  await Promise.allSettled(
    source.map(async (s) => {
      try {
        let targetName = s.name;
        let found = false;
        while (!found) {
          let destPath = join(imagesRoot, dest.key, targetName);
          let idx = 1;
          found = true;
          await stat(destPath)
            .then((e) => {
              // target already exists
              found = false;
              const ext = extname(s.name);
              const base = basename(s.name, ext);
              targetName = base + ` (${idx++})` + ext;
              destPath = join(imagesRoot, dest.key);
            })
            .catch((e) => {});
        }

        await copyMetadata(s, { album: dest, name: targetName }, true);
        await rename(
          join(imagesRoot, s.album.key, s.name),
          join(imagesRoot, dest.key, s.name)
        );
        albumChanged(s.album, updatedAlbums);
        albumChanged(dest, updatedAlbums);
      } catch (e: any) {
        job.errors.push(e.message as string);
      } finally {
        job.progress.remaining--;
      }
    })
  );
  job.status = "finished";
  job.changed();
  return updatedAlbums;
}

async function copyJob(job: Job): Promise<Album[]> {
  job.status = "started";
  const updatedAlbums: Album[] = [];
  const source = job.data.source as AlbumEntry[];
  const dest = job.data.destination as Album;
  const steps = source.length;
  job.progress.start = steps;
  job.progress.remaining = steps;
  job.changed();
  await Promise.allSettled(
    source.map(async (s) => {
      try {
        let targetName = s.name;
        let found = false;
        let idx = 1;
        while (!found) {
          let destPath = join(imagesRoot, dest.key, targetName);
          found = true;
          await stat(destPath).catch((e) => {
            // target already exists
            found = false;
            const ext = extname(s.name);
            const base = basename(s.name, ext);
            targetName = base + ` (${idx++})` + ext;
            destPath = join(imagesRoot, dest.key);
          });
        }

        await copyFile(
          join(imagesRoot, s.album.key, s.name),
          join(imagesRoot, dest.key, targetName)
        );
        await copyMetadata(s, { album: dest, name: targetName }, false);
        albumChanged(dest, updatedAlbums);
      } catch (e: any) {
        job.errors.push(e.message as string);
      } finally {
        job.progress.remaining--;
        job.changed();
      }
    })
  );
  job.status = "finished";
  job.changed();
  return updatedAlbums;
}

async function duplicateJob(job: Job): Promise<Album[]> {
  job.data.destination = job.data.source![0].album;
  return copyJob(job);
}

async function deleteJob(job: Job): Promise<Album[]> {
  // Deleting a set of images means renaming them
  job.status = "started";
  const updatedAlbums: Album[] = [];
  const source = job.data.source as AlbumEntry[];
  const steps = source.length;
  job.progress.start = steps;
  job.progress.remaining = steps;
  job.changed();
  await Promise.allSettled(
    source.map(async (s) => {
      try {
        const from = join(imagesRoot, s.album.key, s.name);
        const to = join(imagesRoot, s.album.key, "." + s.name);
        await rename(from, to);
        albumChanged(s.album, updatedAlbums);
      } catch (e: any) {
        job.errors.push(e.message as string);
      } finally {
        job.progress.remaining--;
        job.changed();
      }
    })
  );
  job.status = "finished";
  job.changed();
  return updatedAlbums;
}

async function exportJob(job: Job): Promise<Album[]> {
  // Deleting a set of images means renaming them
  job.status = "started";

  const source = job.data.source as AlbumEntry[];
  const steps = source.length;
  job.progress.start = steps;
  job.progress.remaining = steps;
  job.changed();
  const targetFolder = join(
    exportsRoot,
    "exports-" + new Date().toLocaleString()
  );
  await mkdir(targetFolder, { recursive: true });
  for (const src of source) {
    try {
      await exportToFolder(src, targetFolder);
    } catch (e: any) {
      job.errors.push(e.message as string);
    } finally {
      job.progress.remaining--;
      job.changed();
    }
  }
  job.status = "finished";
  job.changed();

  openExplorer(targetFolder);
  return [];
}

async function copyMetadata(
  source: AlbumEntry,
  dest: AlbumEntry,
  deleteSource: boolean = false
) {
  const sourceIniData = await readPicasaIni(source.album);
  if (sourceIniData[source.name]) {
    const targetIniData = await readPicasaIni(dest.album);
    targetIniData[dest.name] = sourceIniData[source.name];
    writePicasaIni(dest.album, targetIniData);
    if (deleteSource) {
      delete sourceIniData[source.name];
      writePicasaIni(source.album, sourceIniData);
    }
  }

  const sourceThumbs = await readImageFileMetas(source);
  await writeImageFileMetas(dest, sourceThumbs);

  if (deleteSource) {
    deleteImageFileMetas(source);
  }
}
