import { spawn } from "child_process";
import { copyFile, mkdir, utimes } from "fs/promises";
import { join } from "path";
import { Queue } from "../../../shared/lib/queue";
import { RESIZE_ON_EXPORT_SIZE } from "../../../shared/lib/shared-constants";
import { isPicture, isVideo } from "../../../shared/lib/utils";
import { Album, Job } from "../../../shared/types/types";
import { PhotoLibraryPath, exportsRoot } from "../../utils/constants";
import {
  entryFilePath,
  mediaName,
  removeExtension,
  safeWriteFile,
} from "../../utils/serverUtils";
import { buildImage } from "../imageOperations/sharp-processor";
import { media } from "./albumUtils";
import { importScript, openWithFinder } from "./osascripts";
import { readAlbumIni } from "./picasaIni";
import { folders, waitUntilWalk } from "../albumTypes/fileAndFolders";

function photoLibrary() {
  return join(PhotoLibraryPath, "database", "Photos.sqlite");
}

function pruneExtraData(fileName: string) {
  return removeExtension(fileName)
    .replace(/(^[^0-9a-z]*)|([^0-9a-z]*$)/gi, "")
    .toLowerCase();
}

async function allPhotosInPhotoApp(): Promise<string[]> {
  async function read(stream: any) {
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(chunk);
    return Buffer.concat(chunks).toString("utf8");
  }

  const list = await read(
    spawn("sqlite3", [
      photoLibrary(),
      "select ZORIGINALFILENAME  from ZADDITIONALASSETATTRIBUTES",
    ]).stdout
  );
  return list.split("\n").map(pruneExtraData);
}
export async function exportAllFavoritesJob(job: Job): Promise<Album[]> {
  //const parsingImages = allPhotosInPhotoApp();
  job.progress.remaining = job.progress.start = 1;
  job.changed();
  await waitUntilWalk();
  job.status = "started";

  // Job with no parameters
  const albums = await folders("");

  job.progress.remaining = job.progress.start = albums.length;
  job.changed();

  //const allPics = await parsingImages;
  const missingPicturePath: string[] = [];

  const targetFolder = join(
    exportsRoot,
    "exports-" + new Date().toLocaleString().replace(/\//g, "-")
  );
  await mkdir(targetFolder, { recursive: true });

  const q = new Queue(3);
  for (const album of albums) {
    q.add(async () => {
      const p = await readAlbumIni(album);
      const m = await media(album);

      for (const entry of m.entries) {
        if (p[entry.name].star) {
          const targetPictureFileName = entry.album.name + "-" + entry.name;
          /*if (allPics.includes(pruneExtraData(targetPictureFileName))) {
            continue;
          }*/
          job.progress.start++;
          q.add(async () => {
            // Create target file name
            const targetFileName = join(targetFolder, targetPictureFileName);
            if (isPicture(entry)) {
              // resize + rename + label
              const imageLabel = mediaName(entry);
              const transform = p[entry.name].filters || "";
              const res = await buildImage(
                entry,
                p[entry.name],
                transform +
                  `;label=1,${encodeURIComponent(
                    imageLabel
                  )},25,south` /*;exif=${encodeURIComponent(JSON.stringify(exif))}`*/,
                []
              );
              await safeWriteFile(targetFileName, res.data);
              missingPicturePath.push(targetFileName);
            }
            if (isVideo(entry)) {
              // copy file
              await copyFile(entryFilePath(entry), targetFileName);
              function albumNameToDate(name: string): Date {
                let [y, m, d] = name.split("-").map(parseInt);
                if (y > 1800) {
                  if (m <= 0 || m > 12 || Number.isNaN(m)) {
                    m = 1;
                  }
                  if (d <= 0 || d > 31 || Number.isNaN(d)) {
                    d = 1;
                  }
                }
                return new Date(y, m, d, 12);
              }
              await utimes(
                targetFileName,
                albumNameToDate(entry.album.name),
                albumNameToDate(entry.album.name)
              );
              missingPicturePath.push(targetFileName);
            }
          });
        }
      }
    }).finally(() => {
      job.progress.remaining--;
      job.changed();
    });
  }
  await q.drain();
  await openWithFinder(targetFolder, true);
  await copyInPhotoApp(missingPicturePath);
  job.progress.remaining = 0;
  job.changed();
  return [];
}
async function copyInPhotoApp(files: string[]) {
  importScript(files);
}
