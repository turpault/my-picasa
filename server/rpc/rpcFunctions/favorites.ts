import { spawn } from "child_process";
import exifr from "exifr";
import { copyFile, mkdir, unlink, utimes } from "fs/promises";
import { join } from "path";
import { RESIZE_ON_EXPORT_SIZE } from "../../../shared/lib/shared-constants";
import {
  buildReadySemaphore,
  isPicture,
  isVideo,
  setReady,
} from "../../../shared/lib/utils";
import {
  AlbumEntry,
  AlbumEntryPicasa,
  AlbumEntryWithMetadata,
} from "../../../shared/types/types";
import { events } from "../../events/server-events";
import {
  addImageInfo,
  imageInfo,
  updateImageDate,
} from "../../imageOperations/info";
import { buildImage } from "../../imageOperations/sharp-processor";
import { media } from "../../rpc/rpcFunctions/albumUtils";
import {
  getOsxPhotosDump,
  getPhotoFavorites,
} from "../../rpc/rpcFunctions/osascripts";
import {
  readAlbumIni,
  updatePicasaEntry,
} from "../../rpc/rpcFunctions/picasa-ini";
import { PhotoLibraryPath, imagesRoot } from "../../utils/constants";
import {
  entryFilePath,
  fileExists,
  mediaName,
  removeExtension,
  safeWriteFile,
} from "../../utils/serverUtils";
import { folders, waitUntilWalk } from "../../walker";

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

export async function monitorFavorites() {
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
    ]).stdout,
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

export async function exportFavorite(entry: AlbumEntry): Promise<void> {
  const targetFolder = join(imagesRoot, "favorites");
  if (!(await fileExists(targetFolder))) {
    await mkdir(targetFolder, { recursive: true });
  }

  const targetFileName = join(
    targetFolder,
    entry.album.name + "-" + entry.name,
  );
  const entryMeta = (await readAlbumIni(entry.album))[entry.name];
  if (!entryMeta.star) return;

  if (!(await fileExists(targetFileName))) {
    if (isPicture(entry)) {
      const imageLabel = mediaName(entry);
      const transform = entryMeta.filters || "";
      const res = await buildImage(
        entry,
        entryMeta,
        `compress=1,${RESIZE_ON_EXPORT_SIZE},;` +
          transform +
          `;label=1,${encodeURIComponent(
            imageLabel,
          )},25,south` /*;exif=${encodeURIComponent(JSON.stringify(exif))}*/,
        [],
      );
      await safeWriteFile(
        targetFileName,
        addImageInfo(res.data, {
          softwareInfo: "PICISA",
          imageDescription: entry.album.name,
        }),
      );
      const tags = await exifr.parse(targetFileName).catch((e: any) => {
        console.error(
          `Exception while reading exif for ${targetFileName}: ${e}`,
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
        albumNameToDate(entry.album.name),
      );
    }
  }
}

export async function syncFavoritesFromPhotoApp(
  progress: (progress: number, total: number) => void,
) {
  await waitUntilWalk();
  const albums = await folders(undefined);
  const alreadyStarred: AlbumEntryWithMetadata[] = [];
  const allPhotos: {
    metadata: AlbumEntryWithMetadata;
    name: string;
    dateTaken: number;
  }[] = [];
  const newStarred: AlbumEntryWithMetadata[] = [];
  const promises: Promise<void>[] = [];

  const fullListPromise = (async () => {
    await Promise.all(
      albums.map(async (album) => {
        const m = await media(album);

        for (const entry of m.entries) {
          try {
            const metadata = await imageInfo(entry);
            allPhotos.push({
              metadata,
              name: removeExtension(entry.name).toLowerCase(),
              dateTaken: new Date(metadata.raw.dateTaken!).getTime(),
            });
            if (metadata.raw.photostar) {
              alreadyStarred.push(metadata);
            }
          } catch (e) {
            console.error(`Error while getting image info for ${entry.name}`);
            debugger;
            continue;
          }
        }
      }),
    );
    allPhotos.sort((a, b) => {
      return a.name.localeCompare(b.name);
    });
  })();
  function candidatesOf(name: string) {
    // Dichotomy search in the sorted list of all the photos
    let left = 0;
    let right = allPhotos.length - 1;
    while (left < right) {
      const mid = Math.floor((left + right) / 2);
      const midName = allPhotos[mid].name;
      if (midName === name) {
        left = mid;
        break;
      }
      if (midName < name) {
        left = mid + 1;
      } else {
        right = mid;
      }
    }
    if (allPhotos[left].name !== name) return [];
    while (left > 0) {
      if (allPhotos[left].name !== name) {
        left++;
        break;
      }
      left--;
    }
    // left is the first element of the list
    right = left + 1;
    while (allPhotos[right].name === name) {
      right++;
    }
    return allPhotos.slice(left, right);
  }

  const MAX_DISTANCE = 1000 * 60 * 60 * 24;
  await getOsxPhotosDump(async (photo, index, total) => {
    await fullListPromise;
    console.info(
      `MacOS Photo scan: Scanning ${index} of ${total} (${photo.name})`,
    );
    progress(index, total);
    const c1 = removeExtension(photo.name).toLowerCase();
    const candidates = candidatesOf(c1);
    let filteredCandidates: AlbumEntryWithMetadata[] = [];
    if (candidates.length === 0) {
      console.warn(`Photo ${photo.name} not found in the server`);
      return;
    } else if (candidates.length === 1) {
      filteredCandidates = [candidates[0].metadata];
    } else {
      // More than one candidate, check the date
      const refTime = new Date(photo.dateTaken).getTime();
      const sortedCandidates = candidates
        .filter((c) => c.dateTaken)
        .map((c) => ({
          c,
          distance: Math.abs(c.dateTaken - refTime),
        }))
        .sort((a, b) => {
          return a.distance - b.distance;
        });
      // The photo might be in the list several times - add a favorite to all of them
      if (
        sortedCandidates.length > 0 &&
        sortedCandidates[0].distance < MAX_DISTANCE
      ) {
        filteredCandidates = sortedCandidates
          .filter((s) => s.distance === sortedCandidates[0].distance)
          .map((s) => s.c.metadata);
      } else {
        console.warn(`Photo ${photo.name} not found in the server`);
        return;
      }
    }
    if (photo.persons) {
      filteredCandidates.forEach((candidate) => {
        promises.push(updatePicasaEntry(candidate, "persons", photo.persons));
      });
    }
    if (photo.favorite) {
      filteredCandidates.forEach((candidate) => {
        newStarred.push(candidate);
        if (alreadyStarred.includes(candidate)) {
          // do nothing
        } else {
          promises.push(updatePicasaEntry(candidate, "photostar", 1));
        }
      });
    }
  });
  for (const photo of allPhotos) {
    if (newStarred.includes(photo.metadata)) {
      // do nothing
    } else {
      promises.push(updatePicasaEntry(photo.metadata, "photostar", undefined));
    }
  }
  await Promise.all(promises);
}
