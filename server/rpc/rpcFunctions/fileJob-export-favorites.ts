import { spawn } from "child_process";
import { copyFile, writeFile } from "fs/promises";
import { join } from "path";
import { env } from "process";
import { Queue } from "../../../shared/lib/queue";
import { isPicture, isVideo, mediaName, sleep } from "../../../shared/lib/utils";
import {
  Album, Job
} from "../../../shared/types/types";
import { exportsRoot } from "../../utils/constants";
import { entryFilePath } from "../../utils/serverUtils";
import { buildImage } from "../imageOperations/sharp-processor";
import { media } from "./media";
import { importScript } from "./osascripts";
import { readPicasaIni } from "./picasaIni";
import { folders, updateLastWalkLoop, waitUntilWalk } from "./walker";

const exportFolder = "/tmp/t";
function photoLibrary() {
  return join(
    env.HOME,
    "Pictures",
    "Photos Library.photoslibrary",
    "database",
    "photos.db"
  );
}

async function allPhotosInPhotoApp(): Promise<string[]> {
  async function read(stream) {
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    return Buffer.concat(chunks).toString("utf8");
  }

  const list = await read(
    spawn(
      `sqlite3 "${photoLibrary()}" "select ZORIGINALFILENAME  from ZADDITIONALASSETATTRIBUTES"`
    ).stdout
  );
  return list.split("\n");
}
async function exportAllFavoritesJob(job: Job): Promise<Album[]> {
  job.status = "started";

  // Job with no parameters
  const albums = await folders("");

  job.progress.remaining = job.progress.start = albums.length;
  job.changed();

  const allPics = await allPhotosInPhotoApp();
  const missingPicturePath: string[] = [];

  const targetFolder = join(
    exportsRoot,
    "exports-" + new Date().toLocaleString().replace(/\//g, "-")
  );

  const q = new Queue(3);
  q.event.on("changed", (event) => {
    job.progress.remaining = event.waiting + event.progress;
    job.progress.start = event.done + event.progress + event.waiting;
    job.changed();
  });
  q.event.on("drain", async () => {
    job.progress.remaining = 1;
    job.changed();
    await copyInPhotoApp(missingPicturePath);
    job.progress.remaining = 0;
    job.changed();
  });
  for (const album of albums) {
    q.add(async () => {
      const p = await readPicasaIni(album);
      const m = await media(album, "");

      for (const entry of m.entries) {
        if (p[entry.name].star) {
          const targetPictureFileName = entry.album.name + " - " + entry.name;
          if (allPics.includes(targetPictureFileName)) {
            continue;
          }
          q.add(async () => {
            // Create target file name
            if (isPicture(entry)) {
              // resize + rename + label
              const imageLabel = mediaName(entry);
              const targetFileName = join(exportFolder, targetPictureFileName);
              const transform = p[entry.name].filters || "";
              const res = await buildImage(
                entry,
                p[entry.name],
                transform + `;resize 1,1500; label 1,"${imageLabel}',12,south`,
                []
              );
              await writeFile(targetFileName, res.data);
              missingPicturePath.push(targetFileName);
            }
            if (isVideo(entry)) {
              // copy file
              const targetFileName = join(exportFolder, targetPictureFileName);
              await copyFile(entryFilePath(entry), targetFileName)
              missingPicturePath.push(targetFileName);
            }
          });
        }
      }
    });
  }
  async function copyInPhotoApp(files:string[]) {
    const osascript = importScript(files);
    await writeFile('/tmp/importScript', osascript);
    return new Promise(resolve =>
      spawn("osascript /tmp/importScript").on('close', resolve)
    );
  }
  return [];
}

if (require.main === module) {
  updateLastWalkLoop();
  await sleep(1);
  waitUntilWalk();
  allPhotosInPhotoApp();
}
