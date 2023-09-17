import { spawn } from "child_process";
import exifr from "exifr";
import { copyFile, mkdir, unlink, utimes } from "fs/promises";
import { join } from "path";
import { Queue } from "../../shared/lib/queue";
import { RESIZE_ON_EXPORT_SIZE } from "../../shared/lib/shared-constants";
import {
  buildReadySemaphore,
  isPicture,
  isVideo,
  setReady,
} from "../../shared/lib/utils";
import { AlbumEntry } from "../../shared/types/types";
import { events } from "../events/events";
import { addImageInfo } from "../imageOperations/info";
import { buildImage } from "../imageOperations/sharp-processor";
import { media } from "../rpc/rpcFunctions/albumUtils";
import { readAlbumIni } from "../rpc/rpcFunctions/picasaIni";
import { waitUntilIdle } from "../utils/busy";
import { PhotoLibraryPath, imagesRoot } from "../utils/constants";
import {
  entryFilePath,
  fileExists,
  mediaName,
  removeExtension,
  safeWriteFile,
} from "../utils/serverUtils";
import { folders, waitUntilWalk } from "./bg-walker";

const readyLabelKey = "favorites";
const ready = buildReadySemaphore(readyLabelKey);

function albumNameToDate(name: string): Date {
  let [y, m, d] = name
    .split(" ")[0]
    .split("-")
    .map((v) => parseInt(v));
  if (y < 1900) {
    y = 1900;
  }
  if (y > 3000 || y < 1800 || Number.isNaN(y)) {
    // No date information, return an old date
    return new Date(1900, 0, 1);
  }

  if (m === undefined || m < 0 || m > 11 || Number.isNaN(m)) {
    m = 0;
  } else {
    // Month are 1-based
    m++;
  }
  if (d === undefined || d <= 0 || d > 31 || Number.isNaN(d)) {
    d = 1;
  }
  return new Date(y, m, d, 12);
}

export async function buildFavoriteFolder() {
  const favoritesFolder = join(imagesRoot, "favorites");
  if (!(await fileExists(favoritesFolder))) {
    await mkdir(favoritesFolder, { recursive: true });
  }
  await waitUntilWalk();
  events.on("favoriteChanged", onFavoriteChanged);

  await exportAllMissing();
  setReady(readyLabelKey);
}
async function onFavoriteChanged(e: { entry: AlbumEntry; starCount: number }) {
  await ready;
  if (e.starCount == 0) {
    await deleteFavorite(e.entry);
  } else {
    await exportFavorite(e.entry);
  }
}

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

async function deleteFavorite(entry: AlbumEntry): Promise<void> {
  const targetFolder = join(imagesRoot, "favorites", entry.album.name);
  const targetFileName = join(entry.album.name + "-" + entry.name);
  if (await fileExists(targetFileName)) {
    await unlink(targetFileName);
  }
}

async function exportFavorite(entry: AlbumEntry): Promise<void> {
  const targetFolder = join(imagesRoot, "favorites");
  if (!(await fileExists(targetFolder))) {
    await mkdir(targetFolder, { recursive: true });
  }

  const targetFileName = join(
    targetFolder,
    entry.album.name + "-" + entry.name
  );
  const entryMeta = (await readAlbumIni(entry.album))[entry.name];
  if (!entryMeta.star) return;

  if (!(await fileExists(targetFileName))) {
    if (isPicture(entry)) {
      const imageLabel = mediaName(entry);
      const transform = entryMeta.filters || "";
      const res = await buildImage(
        entry,
        entry,
        `compress=1,${RESIZE_ON_EXPORT_SIZE},;` +
          transform +
          `;label=1,${encodeURIComponent(
            imageLabel
          )},25,south` /*;exif=${encodeURIComponent(JSON.stringify(exif))}*/,
        []
      );
      await safeWriteFile(
        targetFileName,
        addImageInfo(res.data, {
          softwareInfo: "PICISA",
          imageDescription: entry.album.name,
        })
      );
      const tags = await exifr.parse(targetFileName).catch((e: any) => {
        console.error(
          `Exception while reading exif for ${targetFileName}: ${e}`
        );
        return {};
      });
      if (tags.DateTimeOriginal) {
        const dateTimeOriginal = new Date(tags.DateTimeOriginal);
        await utimes(targetFileName, dateTimeOriginal, dateTimeOriginal);
      } /* decode from folder */ else {
        await utimes(
          targetFileName,
          albumNameToDate(entry.album.name),
          albumNameToDate(entry.album.name)
        );
      }
    }
    if (isVideo(entry)) {
      // copy file
      await copyFile(entryFilePath(entry), targetFileName);

      await utimes(
        targetFileName,
        albumNameToDate(entry.album.name),
        albumNameToDate(entry.album.name)
      );
    }
  }
}

async function exportAllMissing() {
  // Job with no parameters
  const albums = await folders("");
  const q = new Queue(10);
  for (const album of albums) {
    q.add(async () => {
      const m = await media(album);
      for (const entry of m.entries) {
        q.add(async () => {
          await waitUntilIdle();
          exportFavorite(entry);
        });
      }
    });
  }
  await q.drain();
}
