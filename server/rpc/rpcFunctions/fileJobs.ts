import { copyFile, mkdir, rename, stat } from "fs/promises";
import { basename, dirname, extname, join, relative, sep } from "path";
import { spawn } from "child_process";
import { tmpdir } from "os";
import { lock } from "../../../shared/lib/mutex";
import { debounced, sleep, uuid } from "../../../shared/lib/utils";
import { pathForAlbum, pathForAlbumEntry } from "../../utils/serverUtils";

import {
  Album,
  AlbumEntry,
  AlbumKind,
  JOBNAMES,
  Job,
  JobData,
  idFromKey,
  keyFromID,
} from "../../../shared/types/types";
import { exportToFolder } from "../../imageOperations/export";
import { exportsFolder, imagesRoot } from "../../utils/constants";
import { entryFilePath, fileExists } from "../../utils/serverUtils";
import { broadcast } from "../../utils/socketList";
import { addToUndo, registerUndoProvider } from "../../utils/undo";
import {
  addOrRefreshOrDeleteAlbum,
  onRenamedAlbums,
  refreshAlbumKeys,
} from "../../walker";
import { buildPersonsList } from "../albumTypes/persons";
import { buildProject, eraseProject } from "../albumTypes/projects";
import { setRank } from "./albumUtils";
import { eraseFace } from "./faces";
import { syncFavoritesFromPhotoApp } from "./favorites";
import { openWithFinder } from "./osascripts";
import {
  albumFromNameAndKind,
  getPicasaEntry,
  readAlbumIni,
  updatePicasaEntry,
} from "./picasa-ini";
import { copyThumbnails } from "./thumbnail-cache";

const jobs: Job[] = [];
type MultiMoveJobArguments = {
  source: AlbumEntry;
  destination: Album;
  rank: number | undefined;
}[];
const numberedOutRegex = /\([0-9+]\)\./;
const numberedOutRegexReplacer = /[ ]*\([0-9+]\)\./;

export async function getJob(id: string): Promise<object> {
  const j = jobs.filter((j) => j.id === id);
  if (j.length) {
    if (typeof j[0] === "undefined") debugger;
    return j[0];
  }
  throw new Error("Not Found");
}

export async function waitJob(id: string): Promise<object> {
  const j = jobs.filter((j) => j.id === id);
  if (j.length) {
    if (typeof j[0] === "undefined") debugger;
    await j[0].awaiter();
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
  jobArgs: object,
): Promise<string> {
  const jobId = `Job:${uuid()}`;
  const completion = await lock(jobId);
  const job: Job = {
    id: jobId,
    name: jobName,
    data: jobArgs as JobData,
    status: "queued",
    progress: {
      total: 0,
      remaining: 0,
    },
    errors: [],
    changed: () => {
      broadcast("jobChanged", job);
    },
    completion,
    awaiter: async () => {
      (await lock(jobId))();
      return job;
    },
    out: undefined,
  };
  jobs.push(job);
  executeJob(job)
    .then(async (updatedAlbums: Album[]) => {
      broadcast("jobFinished", job);
      if (updatedAlbums.length) {
        refreshAlbumKeys(updatedAlbums.map((a) => a.key));
      }
    })
    .catch((err: Error) => {
      job.errors.push(err.message);
      job.status = "finished";
    })
    .finally(async () => {
      completion();
      await sleep(10);
      deleteFSJob(job);
    });
  return job.id;
}

async function executeJob(job: Job): Promise<Album[]> {
  switch (job.name) {
    case JOBNAMES.MOVE:
      return moveJob(job);
    case JOBNAMES.MULTI_MOVE:
      return multiMoveJob(job);
    case JOBNAMES.COPY:
      return copyJob(job);
    case JOBNAMES.DUPLICATE:
      return duplicateJob(job);
    case JOBNAMES.EXPORT:
      return exportJob(job);
    case JOBNAMES.DELETE:
      return deleteJob(job);
    case JOBNAMES.RESTORE:
      return restoreJob(job);
    case JOBNAMES.DELETE_ALBUM:
      return deleteAlbumJob(job);
    case JOBNAMES.RESTORE_ALBUM:
      return restoreAlbumJob(job);
    case JOBNAMES.RENAME_ALBUM:
      return renameAlbumJob(job);
    case JOBNAMES.BUILD_PROJECT:
      return buildProjectJob(job);
    case JOBNAMES.POPULATE_IPHOTO_FAVORITES:
      return populateIPhotoFavorites(job);
    case JOBNAMES.TOPAZ_PHOTO_AI:
      return topazPhotoAIJob(job);
    default:
      job.status = "finished";
      job.errors.push(`Unknown job name ${job.name}`);
      break;
  }
  return [];
}

registerUndoProvider(JOBNAMES.MULTI_MOVE, (operation, payload) => {
  createFSJob(operation, payload);
});
registerUndoProvider(JOBNAMES.RENAME_ALBUM, (operation, payload) => {
  createFSJob(operation, payload);
});
registerUndoProvider(JOBNAMES.RESTORE_ALBUM, (operation, payload) => {
  createFSJob(operation, payload);
});
registerUndoProvider(JOBNAMES.RESTORE, (operation, payload) => {
  createFSJob(operation, payload);
});

function albumChanged(album: Album, list: Album[]) {
  if (!list.find((a) => a.key === album.key)) list.push(album);
}

async function moveJob(job: Job): Promise<Album[]> {
  // convert to a multi-move
  const source = job.data.source as AlbumEntry[];
  const { album, rank } = job.data.destination as {
    album: Album;
    rank: number | undefined;
  };
  console.info("Moving ", source.length, "files to", album.name, "rank", rank);
  const mmArgs: MultiMoveJobArguments = source.map((entry, index) => ({
    source: entry,
    destination: album,
    rank,
  }));
  job.data.source = mmArgs;
  job.data.destination = undefined;
  job.data.argument = undefined;

  return multiMoveJob(job);
}

async function copyJob(job: Job): Promise<Album[]> {
  job.status = "started";
  const updatedAlbums: Album[] = [];
  const source = job.data.source as AlbumEntry[];
  const dest = job.data.destination as Album;
  const steps = source.length;
  job.progress.total = steps;
  job.progress.remaining = steps;
  job.changed();
  job.out = [];
  await Promise.allSettled(
    source.map(async (s) => {
      try {
        let targetName = s.name;
        let found = false;
        let idx = 1;
        if (numberedOutRegex.test(targetName)) {
          idx = parseInt(targetName.match(numberedOutRegex)![0].slice(1));
        }
        targetName = targetName.replace(numberedOutRegexReplacer, ".");
        while (!found) {
          let destPath = join(imagesRoot, pathForAlbum(dest), targetName);
          found = true;
          if (await fileExists(destPath)) {
            // target already exists
            found = false;
            targetName = targetName.replace(numberedOutRegexReplacer, ".");
            const ext = extname(targetName);
            const base = basename(targetName, ext);
            targetName = base + ` (${idx++})` + ext;
            destPath = join(imagesRoot, pathForAlbum(dest));
          }
        }

        const newEntry = { album: dest, name: targetName };
        await copyFile(
          entryFilePath(s),
          join(imagesRoot, pathForAlbumEntry(newEntry)),
        );
        await copyMetadata(s, newEntry, false);
        job.out.push(newEntry);
        albumChanged(dest, updatedAlbums);
      } catch (e: any) {
        job.errors.push(e.message as string);
      } finally {
        job.progress.remaining--;
        job.changed();
      }
    }),
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
    noUndo: true,
  };

  // Deleting a set of images means renaming them
  job.status = "started";
  const updatedAlbums: Album[] = [];
  const source = job.data.source as Album;
  job.progress.total = 1;
  job.progress.remaining = 1;
  job.changed();

  const from = join(imagesRoot, pathForAlbum(source));
  const to = join(dirname(from), "." + basename(from));
  const altKey = relative(imagesRoot, to);
  try {
    await rename(from, to);
    undoDeleteAlbumPayload.source.push({
      name: source.name,
      key: altKey,
      kind: AlbumKind.FOLDER,
    });
    albumChanged(source, updatedAlbums);
  } catch (e: any) {
    job.errors.push(e.message as string);
  } finally {
    job.progress.remaining--;
    job.changed();
  }
  addToUndo(
    JOBNAMES.RESTORE_ALBUM,
    `Delete album $1|${source.name}`,
    undoDeleteAlbumPayload,
  );
  job.status = "finished";
  job.changed();
  return updatedAlbums;
}

async function renameAlbumJob(job: Job): Promise<Album[]> {
  const undoDeleteAlbumPayload = {
    source: {} as Album,
    name: "",
    noUndo: true,
  };

  // rename album
  job.status = "started";
  const updatedAlbums: Album[] = [];
  const source = job.data.source as Album;
  const newName = job.data.name as string;
  undoDeleteAlbumPayload.name = source.name;

  job.progress.total = 1;
  job.progress.remaining = 1;
  job.changed();

  const targetAlbum = { ...source };
  targetAlbum.name = newName;
  const newPath = source.key.split(sep);
  newPath.pop();
  newPath.push(newName);
  targetAlbum.key = newPath.join(sep);

  try {
    await rename(
      join(imagesRoot, pathForAlbum(source)),
      join(imagesRoot, pathForAlbum(targetAlbum)),
    );
    undoDeleteAlbumPayload.source = targetAlbum;
    onRenamedAlbums(source, targetAlbum);
  } catch (e: any) {
    job.errors.push(e.message as string);
  } finally {
    job.progress.remaining--;
    job.changed();
  }
  if (!job.data.noUndo) {
    addToUndo(
      JOBNAMES.RENAME_ALBUM,
      `Rename album $1 to $2|${source.name}|${targetAlbum.name}`,
      undoDeleteAlbumPayload,
    );
  }
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
  job.progress.total = steps;
  job.progress.remaining = steps;
  job.changed();
  await Promise.allSettled(
    source.map(async (s) => {
      try {
        if (!s.name.startsWith(".")) {
          throw new Error(`${s.name} is not a deleted file`);
        }
        const from = entryFilePath(s);
        const to = join(imagesRoot, pathForAlbum(s.album), s.name.slice(1));
        await rename(from, to);
        albumChanged(s.album, updatedAlbums);
      } catch (e: any) {
        job.errors.push(e.message as string);
      } finally {
        job.progress.remaining--;
        job.changed();
      }
    }),
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
  job.progress.total = steps;
  job.progress.remaining = steps;
  job.changed();
  try {
    const from = join(imagesRoot, pathForAlbum(source));
    if (!basename(source.key).startsWith(".")) {
      throw new Error(`${source.name} is not a deleted file`);
    }
    const newKey = join(
      dirname(idFromKey(source.key).id),
      basename(source.key).substr(1),
    );
    const to = join(imagesRoot, idFromKey(newKey).id);
    await rename(from, to);
    albumChanged(
      {
        name: source.name,
        key: keyFromID(newKey, AlbumKind.FOLDER),
        kind: AlbumKind.FOLDER,
      },
      updatedAlbums,
    );
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
    noUndo: true,
  };

  // Deleting a set of images means renaming them
  job.status = "started";
  const updatedAlbums: Album[] = [];
  const source = job.data.source as AlbumEntry[];
  const steps = source.length;
  job.progress.total = steps;
  job.progress.remaining = steps;
  job.changed();
  await Promise.allSettled(
    source.map(async (s) => {
      try {
        if (s.album.kind === AlbumKind.FOLDER) {
          const from = entryFilePath(s);
          const to = join(imagesRoot, pathForAlbum(s.album), "." + s.name);
          await rename(from, to);
          undoDeletePayload.source.push({ album: s.album, name: "." + s.name });
          albumChanged(s.album, updatedAlbums);
        } else if (s.album.kind === AlbumKind.FACE) {
          eraseFace(s);
        } else if (s.album.kind === AlbumKind.PROJECT) {
          eraseProject(s);
        }
      } catch (e: any) {
        job.errors.push(e.message as string);
      } finally {
        job.progress.remaining--;
        job.changed();
      }
    }),
  );
  addToUndo(
    JOBNAMES.RESTORE,
    `Delete $1 files...|${source.length}`,
    undoDeletePayload,
  );
  job.status = "finished";
  job.changed();
  return updatedAlbums;
}

async function multiMoveJob(job: Job): Promise<Album[]> {
  const undoMultiMovePayload = {
    source: [] as MultiMoveJobArguments,
    noUndo: false,
  };

  job.status = "started";
  const updatedAlbums: Album[] = [];
  const source = job.data.source as {
    source: AlbumEntry;
    destination: Album;
    rank: number;
  }[];
  const steps = source.length;
  job.progress.total = steps;
  job.progress.remaining = steps;
  job.changed();
  for (const s of source) {
    try {
      let targetName = s.source.name;
      const sourceRank = parseInt((await getPicasaEntry(s.source)).rank || "0");
      if (s.destination.key !== s.source.album.key) {
        let found = false;
        let destPath = join(
          imagesRoot,
          idFromKey(s.destination.key).id,
          targetName,
        );
        let idx = 1;
        while (!found) {
          found = true;
          await stat(destPath)
            .then((e) => {
              // target already exists
              found = false;
              const ext = extname(s.source.name);
              const base = basename(s.source.name, ext);
              targetName = base + ` (${idx++})` + ext;
              destPath = join(
                imagesRoot,
                idFromKey(s.destination.key).id,
                targetName,
              );
            })
            .catch((e) => {});
        }
        await copyMetadata(
          s.source,
          { album: s.destination, name: targetName },
          true,
        );
        await rename(
          entryFilePath(s.source),
          join(imagesRoot, pathForAlbum(s.destination), targetName),
        );
        undoMultiMovePayload.source.push({
          source: {
            album: s.destination,
            name: targetName,
          },
          destination: s.source.album,
          rank: sourceRank,
        });
      }
      await setRank({ album: s.destination, name: targetName }, s.rank);
      if (s.source.album.key !== s.destination.key) {
        albumChanged(s.source.album, updatedAlbums);
        albumChanged(s.destination, updatedAlbums);
      }
    } catch (e: any) {
      job.errors.push(e.message as string);
    } finally {
      job.progress.remaining--;
    }
  }
  if (!job.data.noUndo) {
    undoMultiMovePayload.noUndo = true;
    addToUndo(
      JOBNAMES.MULTI_MOVE,
      `Move $1 files to $2...|${source.length}|${source[0].destination.name}`,
      undoMultiMovePayload,
    );
  }
  job.status = "finished";
  job.changed();
  return updatedAlbums;
}

async function exportJob(job: Job): Promise<Album[]> {
  // Deleting a set of images means renaming them
  job.status = "started";

  const source = job.data.source as AlbumEntry[];
  const destination = job.data.destination;
  const steps = source.length;
  job.progress.total = steps;
  job.progress.remaining = steps;
  job.changed();
  const targetFolder = destination
    ? join(imagesRoot, pathForAlbum(destination))
    : join(
        exportsFolder,
        "exports-" + new Date().toLocaleString().replace(/\//g, "-"),
      );
  job.name =
    "Exporting to $1|" + (destination ? destination.name : targetFolder);
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

  if (!destination) {
    openWithFinder(targetFolder, true);
  } else {
    addOrRefreshOrDeleteAlbum(destination, undefined, true);
  }
  return [];
}

async function buildProjectJob(job: Job): Promise<Album[]> {
  // Deleting a set of images means renaming them
  job.status = "started";
  const updatedAlbums: Album[] = [];
  const sources = job.data.source as AlbumEntry[];
  const destination = job.data.destination as string;
  job.progress.total = 1;
  job.progress.remaining = sources.length;
  job.changed();

  for (const source of sources) {
    if (source.album.kind === AlbumKind.PROJECT) {
      const newEntry = await buildProject(
        source,
        albumFromNameAndKind(destination, AlbumKind.FOLDER),
        job.data.argument.width,
      );
      job.out = job.out ? [...job.out, newEntry] : [newEntry];
    }
    job.progress.remaining--;
    job.changed();
  }
  job.status = "finished";
  job.changed();
  return updatedAlbums;
}

async function topazPhotoAIJob(job: Job): Promise<Album[]> {
  job.status = "started";
  const source = job.data.source as AlbumEntry[];
  const steps = source.length + 1; // +1 for the Topaz CLI execution
  job.progress.total = steps;
  job.progress.remaining = steps;
  job.changed();

  // Create temporary directory for input processing
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const tempDir = join(tmpdir(), `topaz-${timestamp}-${uuid().slice(0, 8)}`);
  const inputDir = join(tempDir, "input");
  
  await mkdir(inputDir, { recursive: true });

  try {
    // Process each image with active filters and save to temp input directory
    for (const entry of source) {
      try {
        await exportToFolder(entry, inputDir);
        job.progress.remaining--;
        job.changed();
      } catch (e: any) {
        job.errors.push(`Failed to process ${entry.name}: ${e.message}`);
        job.progress.remaining--;
        job.changed();
      }
    }

    // Run Topaz Photo AI CLI for each album separately to maintain directory structure
    const topazPath = "/Applications/Topaz Photo AI.app/Contents/MacOS/Topaz Photo AI";
    const inputFiles = await import("fs/promises").then(fs => fs.readdir(inputDir));
    const imageFiles = inputFiles.filter(file => 
      /\.(jpg|jpeg|png|tiff|tif)$/i.test(file)
    );

    if (imageFiles.length === 0) {
      job.errors.push("No valid image files found to process");
      job.status = "finished";
      job.changed();
      return [];
    }

    // Group images by album to process them in their respective directories
    const albumGroups = new Map<string, { album: Album; files: string[] }>();
    
    for (const entry of source) {
      const albumKey = entry.album.key;
      if (!albumGroups.has(albumKey)) {
        albumGroups.set(albumKey, { album: entry.album, files: [] });
      }
      
      // Find the corresponding processed file
      const processedFile = imageFiles.find(file => 
        file.includes(entry.name.replace(/\.[^/.]+$/, ""))
      );
      if (processedFile) {
        albumGroups.get(albumKey)!.files.push(processedFile);
      }
    }

    job.name = `Enhancing ${imageFiles.length} image(s) with Topaz Photo AI`;
    job.changed();

    // Process each album's images in their respective directory
    for (const [albumKey, { album, files }] of albumGroups) {
      if (files.length === 0) continue;
      
      const albumDir = join(imagesRoot, pathForAlbum(album));
      const args = [
        "--cli",
        ...files.map(file => join(inputDir, file)),
        "-o", albumDir
      ];

      await new Promise<void>((resolve, reject) => {
        const proc = spawn(topazPath, args);
        
        proc.stdout.on("data", (data) => {
          console.info(`Topaz Photo AI: ${data.toString()}`);
        });
        
        proc.stderr.on("data", (data) => {
          console.error(`Topaz Photo AI Error: ${data.toString()}`);
        });

        proc.on("close", (code) => {
          if (code === 0) {
            console.info(`Topaz Photo AI completed successfully for album: ${album.name}`);
            resolve();
          } else {
            reject(new Error(`Topaz Photo AI exited with code ${code} for album: ${album.name}`));
          }
        });

        proc.on("error", (err) => {
          reject(new Error(`Failed to start Topaz Photo AI for album ${album.name}: ${err.message}`));
        });
      });
    }

    job.progress.remaining--;
    job.changed();

    // Refresh the albums to show the new enhanced images
    const updatedAlbums = Array.from(albumGroups.values()).map(({ album }) => album);
    for (const album of updatedAlbums) {
      addOrRefreshOrDeleteAlbum(album, undefined, true);
    }

    job.status = "finished";
    job.changed();

  } catch (e: any) {
    job.errors.push(`Topaz Photo AI failed: ${e.message}`);
    job.status = "finished";
    job.changed();
  }

  return [];
}

async function copyMetadata(
  source: AlbumEntry,
  dest: AlbumEntry,
  deleteSource: boolean = false,
) {
  const sourceIniData = await readAlbumIni(source.album);
  if (sourceIniData[source.name]) {
    updatePicasaEntry(dest, "*", sourceIniData[source.name]);

    if (deleteSource) {
      delete sourceIniData[source.name];
      updatePicasaEntry(source, "*", undefined);
    }
  }

  await copyThumbnails(source, dest, deleteSource);
}

async function populateIPhotoFavorites(job: Job): Promise<Album[]> {
  // Deleting a set of images means renaming them
  job.status = "started";
  job.progress.total = 1;
  job.progress.remaining = 1;
  job.changed();
  const d = debounced(
    (progress: number, total: number) => {
      job.progress.total = total;
      job.progress.remaining = total - progress;
      job.changed();
    },
    2000,
    true,
  );

  await syncFavoritesFromPhotoApp(d);
  await buildPersonsList();

  job.status = "finished";
  job.changed();
  return [];
}
