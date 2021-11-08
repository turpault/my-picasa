import {
  copyFile, rename
} from "fs/promises";
import { join } from "path";
import { sleep, uuid } from "../../../shared/lib/utils";
import { SocketAdaptorInterface } from "../../../shared/socket/socketAdaptorInterface";
import { Album, AlbumEntry, Job } from "../../../shared/types/types";
import { imagesRoot } from "../../utils/constants";
import { readPicasaIni, writePicasaIni } from "./picasaIni";
import { readThumbnailIni, writeThumbnailIni } from "./thumbnailInit";

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
  executeJob(job).then(async (updatedAlbums: Album[]) => {
    this.emit("jobFinished", job);
    if (updatedAlbums.length) {
      this.emit("albumChanged", updatedAlbums);
    }
  }).catch((err: Error)=> {
    job.errors.push(err.message);
    job.status = "finished";
  }).finally(async ()=> {
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
      default:
      job.status = "finished";
      job.errors.push(`Unknown job name ${job.name}`);
      break;
  }
  return [];
}

const PICASA = ".picasa.ini";
const THUMBS = ".thumbnails.ini";

function albumChanged(album: Album, list: Album[]) {
  if (!list.find(a=>a.key === album.key)) list.push(album);
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
        await copyMetadata(s, dest, true);
        await rename(join(imagesRoot, s.album.key, s.name), join(imagesRoot, dest.key));
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
        await copyFile(join(imagesRoot, s.album.key, s.name), join(imagesRoot, dest.key));
        await copyMetadata(s, dest, false);
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

async function copyMetadata(
  source: AlbumEntry,
  dest: Album,
  deleteSource: boolean = false
) {
  const targetIniData =await readPicasaIni(dest)
  const sourceIniData =await readPicasaIni(source.album)
  targetIniData[source.name] = sourceIniData[source.name];
  writePicasaIni(dest, targetIniData);
  if(deleteSource) {
    delete sourceIniData[source.name];
    writePicasaIni(source.album, sourceIniData);
  }


  const targetThumbs = await readThumbnailIni(dest);
  const sourceThumbs = await readThumbnailIni(source.album);

  targetThumbs[source.name] = sourceThumbs[source.name];
  writeThumbnailIni(dest, targetThumbs);
  if(deleteSource) {
    delete sourceThumbs[source.name];
    writeThumbnailIni(source.album, sourceThumbs);
  }
}
