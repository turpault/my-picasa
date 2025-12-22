import { mkdir, unlink } from "fs/promises";
import { join } from "path";
import { exportToFolder } from "../../server/imageOperations/export";
import { media } from "../../server/rpc/rpcFunctions/albumUtils";
import { waitUntilIdle } from "../../server/utils/busy";
import { iCloudPhotosFolder, ThumbnailSizes } from "../../server/utils/constants";
import { fileExists, pathForAlbum, pathForAlbumEntry } from "../../server/utils/serverUtils";
import { fileFoundEventEmitter, folders, waitUntilWalk } from "../../server/walker";
import { Queue } from "../../shared/lib/queue";
import { AlbumEntry } from "../../shared/types/types";
import { events } from "../../server/events/server-events";
import debug from "debug";
import { albumEntryFromId, namifyAlbumEntry, removeExtension } from "../../shared/lib/utils";
import { RESIZE_ON_EXPORT_SIZE } from "../../shared/lib/shared-constants";
import { walkAbsolutePath } from "../../server/rpc/rpcFunctions/fs";
import { getPicasaEntry } from "../../server/rpc/rpcFunctions/picasa-ini";
import { exifDataAndStats } from "../../server/rpc/rpcFunctions/exif";
const debugLogger = debug("app:bg-icloud-export");

export async function buildExportsFolder() {
  if (!(await fileExists(iCloudPhotosFolder))) {
    await mkdir(iCloudPhotosFolder, { recursive: true });
  }
  await waitUntilWalk();
  fileFoundEventEmitter.on("fileFound", async (event) => {
    if (await shouldExport(event)) {
      await exportToICloudFolder(event, true);
    }
  });

  await exportAllMissing();
}

async function exportAllMissing() {
  const allFilesInICloudFolder: string[] = [];
  await walkAbsolutePath(iCloudPhotosFolder, (path, modificationTime) => {
    console.log(path, modificationTime);
    allFilesInICloudFolder.push(path);
  });
  const allFilesToExport: string[] = [];
  const albums = await folders();
  for (const album of albums) {
    const m = await media(album);
    for (const entry of m.entries) {
      if (!await shouldExport(entry)) {
        continue;
      }
      allFilesToExport.push(pathForAlbumEntry(entry));
    }
  }
  // Remove files from disk that we should not export
  const promises: Promise<void>[] = [];
  for (const file of allFilesInICloudFolder) {
    if (!allFilesToExport.includes(file)) {
      promises.push(unlink(join(iCloudPhotosFolder, file)));
    }
  }
  // Export all the missing files
  for (const file of allFilesToExport) {
    if (!allFilesInICloudFolder.includes(file)) {
      const entry = albumEntryFromId(file);
      promises.push(exportToICloudFolder(entry!, true));
    }
  }
  await Promise.all(promises);
}
async function shouldExport(entry: AlbumEntry) {
  const meta = await getPicasaEntry(entry);
  const exif = await exifDataAndStats(entry);
  return !meta.star || exif.tags.Make?.toLowerCase() === "apple";
}

async function exportToICloudFolder(entry: AlbumEntry, overwrite: boolean) {
  const folder = join(iCloudPhotosFolder, pathForAlbum(entry.album));
  await mkdir(folder, { recursive: true });
  await exportToFolder(entry, folder, { label: false, resize: RESIZE_ON_EXPORT_SIZE, overwrite, filename: removeExtension(entry.name) });
}


events.on("picasaEntryUpdated", async (event) => {
  try {
    const { entry, field, value } = event;

    // Only update if the field is one we care about
    const relevantFields = ['star', 'starCount', 'filters'];
    if (relevantFields.includes(field) && await shouldExport(entry)) {
      await exportToICloudFolder(entry, true);
    }
  } catch (error) {
    debugLogger("Error handling picasa entry update event:", error);
  }
});