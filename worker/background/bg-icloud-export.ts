import { mkdir } from "fs/promises";
import { join } from "path";
import { exportToFolder } from "../../server/imageOperations/export";
import { media } from "../../server/rpc/rpcFunctions/albumUtils";
import { waitUntilIdle } from "../../server/utils/busy";
import { iCloudPhotosFolder } from "../../server/utils/constants";
import { fileExists } from "../../server/utils/serverUtils";
import { fileFoundEventEmitter, folders, waitUntilWalk } from "../../server/walker";
import { Queue } from "../../shared/lib/queue";
import { AlbumEntry } from "../../shared/types/types";
import { events } from "../../server/events/server-events";
import debug from "debug";
const debugLogger = debug("app:bg-icloud-export");

export async function buildExportsFolder() {
  if (!(await fileExists(iCloudPhotosFolder))) {
    await mkdir(iCloudPhotosFolder, { recursive: true });
  }
  await waitUntilWalk();
  fileFoundEventEmitter.on("fileFound", async (event) => {
    for (const entry of event.entries) {
      await exportToICloudFolder(entry, true);
    }
  });

  await exportAllMissing();
}

async function exportAllMissing() {
  // Job with no parameters
  const albums = await folders();
  const q = new Queue(10);
  for (const album of albums) {
    q.add(async () => {
      const m = await media(album);
      for (const entry of m.entries) {
        q.add(async () => {
          await waitUntilIdle();
          exportToICloudFolder(entry, false);
        });
      }
    });
  }
  await q.drain();
}

async function exportToICloudFolder(entry: AlbumEntry, overwrite: boolean) {
  const folder = join(iCloudPhotosFolder, entry.album.name);
  await mkdir(folder, { recursive: true });
  await exportToFolder(entry, folder, { label: false, compress: true, overwrite });
}


events.on("picasaEntryUpdated", async (event) => {
  try {
    const { entry, field, value } = event;

    // Only update if the field is one we care about
    const relevantFields = ['star', 'starCount', 'filters'];
    if (relevantFields.includes(field)) {
      await exportToICloudFolder(entry, true);
    }
  } catch (error) {
    debugLogger("Error handling picasa entry update event:", error);
  }
});