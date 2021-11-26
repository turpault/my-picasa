import { copyFile, mkdir, rename, stat } from "fs/promises";
import { basename, dirname, extname, join, relative } from "path";
import { range, sleep, uuid } from "../../../shared/lib/utils.js";
import { Album, AlbumEntry, Job } from "../../../shared/types/types.js";
import { openExplorer } from "../../open.js";
import { exportsRoot, imagesRoot } from "../../utils/constants.js";
import { fileExists } from "../../utils/serverUtils.js";
import { broadcast } from "../../utils/socketList.js";
import { addToUndo, registerUndoProvider } from "../../utils/undo.js";
import { exportToFolder } from "../imageOperations/export.js";
import { readPicasaIni, updatePicasaEntry } from "./picasaIni.js";
import { copyThumbnails } from "./thumbnailCache.js";
import { refreshAlbums } from "./walker.js";

const jobs: Job[] = [];

export async function getJob(id: string): Promise<object> {
  const j = jobs.filter((j) => j.id === id);
  if (j.length) {
    if (typeof j[0] === "undefined") debugger;
    return j[0];
  }
  throw new Error("Not Found");
}

function deleteFSJob(job: Job) {
  jobs.splice(jobs.indexOf(job), 1);
  broadcast("jobDeleted", job);
}

export async function createFSJob(
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
        refreshAlbums(updatedAlbums);
        broadcast("albumChanged", updatedAlbums);
      }
    })
    .catch((err: Error) => {
      job.errors.push(err.message);
      job.status = "finished";
    })
    .finally(async () => {
      await sleep(10);
      deleteFSJob(job);
    });
  return job.id;
}

async function executeJob(job: Job): Promise<Album[]> {
  switch (job.name) {
    case "move":
      return moveJob(job);
    case "multiMove":
      return multiMoveJob(job);
    case "copy":
      return copyJob(job);
    case "duplicate":
      return duplicateJob(job);
    case "export":
      return exportJob(job);
    case "delete":
      return deleteJob(job);
    case "restore":
      return restoreJob(job);
    case "deleteAlbum":
      return deleteAlbumJob(job);
    case "restoreAlbum":
      return restoreAlbumJob(job);
    default:
      job.status = "finished";
      job.errors.push(`Unknown job name ${job.name}`);
      break;
  }
  return [];
}

registerUndoProvider("multiMove", (operation, payload) => {
  createFSJob(operation, payload);
});

function albumChanged(album: Album, list: Album[]) {
  if (!list.find((a) => a.key === album.key)) list.push(album);
}

async function moveJob(job: Job): Promise<Album[]> {
  // convert to a multi-move
  const source = job.data.source as AlbumEntry[];
  job.data.destination = range(0, source.length).map(
    () => job.data.destination as Album
  );

  return multiMoveJob(job);
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
          if (await fileExists(destPath)) {
            // target already exists
            found = false;
            const ext = extname(s.name);
            const base = basename(s.name, ext);
            targetName = base + ` (${idx++})` + ext;
            destPath = join(imagesRoot, dest.key);
          }
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
  const source = job.data.source as AlbumEntry[];
  job.data.destination = source[0].album;
  return copyJob(job);
}

async function deleteAlbumJob(job: Job): Promise<Album[]> {
  const undoDeleteAlbumPayload = {
    source: [] as Album[],
  };

  // Deleting a set of images means renaming them
  job.status = "started";
  const updatedAlbums: Album[] = [];
  const source = job.data.source as Album;
  job.progress.start = 1;
  job.progress.remaining = 1;
  job.changed();

  const from = join(imagesRoot, source.key);
  const to = join(dirname(from), "." + basename(from));
  const altKey = relative(imagesRoot, to);
  try {
    await rename(from, to);
    undoDeleteAlbumPayload.source.push({ name: source.name, key: altKey });
    albumChanged(source, updatedAlbums);
  } catch (e: any) {
    job.errors.push(e.message as string);
  } finally {
    job.progress.remaining--;
    job.changed();
  }
  addToUndo(
    "restoreFolder",
    `Delete album ${source.name}`,
    undoDeleteAlbumPayload
  );
  job.status = "finished";
  job.changed();
  return updatedAlbums;
}

async function restoreJob(job: Job): Promise<Album[]> {
  // Restoring a set of images means renaming them
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
        if (!s.name.startsWith(".")) {
          throw new Error(`${s.name} is not a deleted file`);
        }
        const from = join(imagesRoot, s.album.key, s.name);
        const to = join(imagesRoot, s.album.key, s.name.substr(1));
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

async function restoreAlbumJob(job: Job): Promise<Album[]> {
  // Restoring a set of images means renaming them
  job.status = "started";
  const updatedAlbums: Album[] = [];
  const source = job.data.source as Album;
  const steps = 1;
  job.progress.start = steps;
  job.progress.remaining = steps;
  job.changed();
  try {
    const from = join(imagesRoot, source.key);
    if (!basename(source.key).startsWith(".")) {
      throw new Error(`${source.name} is not a deleted file`);
    }
    const newKey = join(dirname(source.key), basename(source.key).substr(1));
    const to = join(imagesRoot, newKey);
    await rename(from, to);
    albumChanged({ name: source.name, key: newKey }, updatedAlbums);
  } catch (e: any) {
    job.errors.push(e.message as string);
  } finally {
    job.progress.remaining--;
    job.changed();
  }
  job.status = "finished";
  job.changed();
  return updatedAlbums;
}

async function deleteJob(job: Job): Promise<Album[]> {
  const undoDeletePayload = {
    source: [] as AlbumEntry[],
  };

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
        undoDeletePayload.source.push({ album: s.album, name: "." + s.name });
        albumChanged(s.album, updatedAlbums);
      } catch (e: any) {
        job.errors.push(e.message as string);
      } finally {
        job.progress.remaining--;
        job.changed();
      }
    })
  );
  addToUndo("restore", `Delete ${source.length} files...`, undoDeletePayload);
  job.status = "finished";
  job.changed();
  return updatedAlbums;
}

async function multiMoveJob(job: Job): Promise<Album[]> {
  const undoMultiMovePayload = {
    source: [] as AlbumEntry[],
    destination: [] as Album[],
  };

  job.status = "started";
  const updatedAlbums: Album[] = [];
  const source = job.data.source as AlbumEntry[];
  const dest = job.data.destination as Album[];
  const steps = source.length;
  job.progress.start = steps;
  job.progress.remaining = steps;
  job.changed();
  await Promise.allSettled(
    source.map(async (s, index) => {
      try {
        let targetName = s.name;
        let found = false;
        while (!found) {
          let destPath = join(imagesRoot, dest[index].key, targetName);
          let idx = 1;
          found = true;
          await stat(destPath)
            .then((e) => {
              // target already exists
              found = false;
              const ext = extname(s.name);
              const base = basename(s.name, ext);
              targetName = base + ` (${idx++})` + ext;
              destPath = join(imagesRoot, dest[index].key);
            })
            .catch((e) => {});
        }

        await copyMetadata(s, { album: dest[index], name: targetName }, true);
        await rename(
          join(imagesRoot, s.album.key, s.name),
          join(imagesRoot, dest[index].key, s.name)
        );
        albumChanged(s.album, updatedAlbums);
        albumChanged(dest[index], updatedAlbums);
        undoMultiMovePayload.source.push({
          album: dest[index],
          name: targetName,
        });
        undoMultiMovePayload.destination.push(s.album);
      } catch (e: any) {
        job.errors.push(e.message as string);
      } finally {
        job.progress.remaining--;
      }
    })
  );
  addToUndo(
    "multiMove",
    `Move ${source.length} files to ${dest[0].name}...`,
    undoMultiMovePayload
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
  const sourceIniData = readPicasaIni(source.album);
  if (sourceIniData[source.name]) {
    updatePicasaEntry(dest, "*", sourceIniData[source.name]);

    if (deleteSource) {
      delete sourceIniData[source.name];
      updatePicasaEntry(source, "*", undefined);
    }
  }

  await copyThumbnails(source, dest, deleteSource);
}
