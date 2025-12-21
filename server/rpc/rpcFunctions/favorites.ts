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
import { PhotoLibraryPath, favoritesFolder, imagesRoot } from "../../utils/constants";
import {
  entryFilePath,
  fileExists,
  mediaName,
  removeExtension,
  safeWriteFile,
} from "../../utils/serverUtils";
import { folders, waitUntilWalk } from "../../walker";
import { exportToFolder } from "../../imageOperations/export";

const readyLabelKey = "favorites";
const ready = buildReadySemaphore(readyLabelKey);

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
    return Buffer.concat(chunks as Uint8Array[]).toString("utf8");
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
  const targetFileName = join(favoritesFolder, entry.album.name + "-" + entry.name);
  if (await fileExists(targetFileName)) {
    await unlink(targetFileName);
  }
}

export async function exportFavorite(entry: AlbumEntry): Promise<void> {
  await exportToFolder(entry, favoritesFolder, { label: true, resize: RESIZE_ON_EXPORT_SIZE });
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
