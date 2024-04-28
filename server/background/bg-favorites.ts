import { spawn } from "child_process";
import exifr from "exifr";
import { copyFile, mkdir, readFile, unlink, utimes } from "fs/promises";
import { join } from "path";
import { Queue } from "../../shared/lib/queue";
import { RESIZE_ON_EXPORT_SIZE } from "../../shared/lib/shared-constants";
import {
  buildReadySemaphore,
  isPicture,
  isVideo,
  memoizer,
  setReady,
  sleep,
} from "../../shared/lib/utils";
import { AlbumEntry, AlbumEntryPicasa } from "../../shared/types/types";
import { events } from "../events/server-events";
import { addImageInfo, updateImageDate } from "../imageOperations/info";
import { buildImage } from "../imageOperations/sharp-processor";
import { media } from "../rpc/rpcFunctions/albumUtils";
import {
  PhotoFromPhotoApp,
  getPhotoFavorites,
} from "../rpc/rpcFunctions/osascripts";
import {
  getPicasaEntry,
  readAlbumIni,
  toggleStar,
} from "../rpc/rpcFunctions/picasa-ini";
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
import { captureException } from "../sentry";

const readyLabelKey = "favorites";
const ready = buildReadySemaphore(readyLabelKey);
const originDate = new Date(1900, 0, 1);

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
    return originDate;
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

  await exportAllMissing();
  syncFavorites();
  events.on("favoriteChanged", onImageChanged);
  events.on("filtersChanged", onImageChanged);
  events.on("rotateChanged", onImageChanged);
  setReady(readyLabelKey);
}

async function onImageChanged(e: { entry: AlbumEntryPicasa }) {
  await ready;
  if (e.entry.metadata.starCount || "0" == "0") {
    await deleteFavorite(e.entry);
  } else {
    // Recreate the favorite
    await deleteFavorite(e.entry);
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
        let dateTimeOriginal = new Date(tags.DateTimeOriginal);
        if (dateTimeOriginal < originDate) {
          dateTimeOriginal = originDate;
          updateImageDate(targetFileName, dateTimeOriginal);
        }
        await utimes(targetFileName, dateTimeOriginal, dateTimeOriginal);
      } /* decode from folder */ else {
        const albumTime = albumNameToDate(entry.album.name);
        await utimes(targetFileName, albumTime, albumTime);
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

const scannedFavorties = join(imagesRoot, ".scannedFavorites");
export async function syncFavorites() {
  await waitUntilWalk();
  while (true) {
    let scanned: PhotoFromPhotoApp[] = [];
    try {
      scanned = JSON.parse(
        await readFile(scannedFavorties, { encoding: "utf-8" })
      ) as PhotoFromPhotoApp[];
    } catch (e) {
      console.error(`Error reading scanned favorites: ${e}`);
    }
    const albums = await folders("");
    const memoize = memoizer();
    await getPhotoFavorites(async (photo, index, total) => {
      console.info(
        `MacOS Photo scan: Scanning ${index} of ${total} (${photo.name})`
      );
      if (
        scanned.find(
          (s) => s.name === photo.name && s.dateTaken === photo.dateTaken
        )
      ) {
        // Found a picture that was already scanned, no need to go further than that
        throw new Error(`Stop : already scanned ${photo.name}`);
      }
      const photoNameNoExt = removeExtension(photo.name);
      const candidates = albums.filter((a) => {
        const [albumDateYear, albumDateMonth] = a.name.split("-");
        if (albumDateYear.length !== 4) {
          return false;
        }
        const albumDateYearInt = parseInt(albumDateYear);
        const albumDateMonthInt = parseInt(albumDateMonth);
        if (albumDateYearInt < 1900 || albumDateYearInt > 3000) {
          return false;
        }
        if (albumDateMonthInt < 1 || albumDateMonthInt > 12) {
          return false;
        }
        return (
          albumDateYearInt === photo.dateTaken.getFullYear() &&
          Math.abs(albumDateMonthInt - (photo.dateTaken.getMonth() + 1)) <= 1
        );
      });
      for (const album of candidates) {
        await waitUntilIdle();
        const m = await memoize(["media", album.name], () => media(album));
        const entry = m.entries.find((e) => e.name.startsWith(photoNameNoExt));
        if (entry) {
          const picasa = await getPicasaEntry(entry);
          if (!picasa.star) {
            console.info(`Synchronized star ${photo.name} in ${album.name}`);
            await toggleStar([entry]);
            try {
              await exportFavorite(entry);
            } catch (e: any) {
              console.error(`Error exporting favorite ${entry.name}: ${e}`);
              captureException(e);
            }
          }
          break;
        }
      }
      scanned.push(photo);
    });
    safeWriteFile(scannedFavorties, JSON.stringify(scanned, null, 2));
    // Wait 24 hours before scanning again
    await sleep(24 * 3600);
  }
}
