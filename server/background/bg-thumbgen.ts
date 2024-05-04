import { watch } from "fs";
import { isMediaUrl, sleep } from "../../shared/lib/utils";
import { AlbumEntry, ThumbnailSizeVals } from "../../shared/types/types";
import { imageInfo } from "../imageOperations/info";
import { media } from "../rpc/rpcFunctions/albumUtils";
import {
  makeThumbnail,
  readOrMakeThumbnail,
} from "../rpc/rpcFunctions/thumbnail";
import { waitUntilIdle } from "../utils/busy";
import { imagesRoot } from "../utils/constants";
import { folders, waitUntilWalk } from "../walker";

const USE_SPINNER = false;

export async function buildThumbs(exitOnComplete: boolean) {
  let spinnerName = Date.now().toString();
  await waitUntilWalk();
  let lastFSChange = new Date().getTime();
  watch(imagesRoot, { recursive: true }, (_eventType, filename) => {
    if (filename && isMediaUrl(filename) && !filename.startsWith(".")) {
      lastFSChange = new Date().getTime();
    }
  });

  await sleep(10);
  const sizes = ThumbnailSizeVals.filter((f) => !f.includes("large"))
    .map((size) => [
      { size, animated: true },
      { size, animated: false },
    ])
    .flat();
  while (true) {
    const albums = await folders("");
    let hasCreatedThumb = false;
    let lastActivity = Date.now();
    for (const album of albums.reverse()) {
      if (hasCreatedThumb) {
        await sleep(1);
      } else {
        await sleep(0.1);
      }
      let m: { entries: AlbumEntry[] };
      try {
        m = await media(album);
      } catch (e) {
        // Yuck folder is gone...
        continue;
      }
      for (const picture of m.entries) {
        await waitUntilIdle();
        await imageInfo(picture);
        const should = await Promise.all(
          sizes.map(({ size, animated }) =>
            readOrMakeThumbnail(picture, size, animated)
          )
        );
        if (should.filter((s) => s).length > 0) {
          await Promise.all(
            sizes.map(({ size, animated }) =>
              makeThumbnail(picture, size, animated)
            )
          );
          if (Date.now() > lastActivity + 2000) {
            lastActivity = Date.now();
          }
        }
      }
    }
    if (exitOnComplete) {
      break;
    }
    await sleep(20);
    const now = new Date().getTime();
    while (true) {
      await sleep(1);
      if (lastFSChange > now) break;
    }
    spinnerName = Date.now().toString();
  }
}
