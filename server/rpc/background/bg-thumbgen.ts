import { watch } from "fs";
import { stat } from "fs/promises";
import Spinnies from "spinnies";
import { isMediaUrl, isVideo, sleep } from "../../../shared/lib/utils.js";
import { ThumbnailSizeVals } from "../../../shared/types/types.js";
import { isIdle } from "../../utils/busy.js";
import { imagesRoot } from "../../utils/constants.js";
import { readOrMakeThumbnail } from "../rpcFunctions/thumbnail.js";
import { thumbnailPathFromEntryAndSize } from "../rpcFunctions/thumbnailCache.js";
import { folders, media } from "../rpcFunctions/walker.js";
import { bouncingBall } from "cli-spinners";

export async function buildThumbs() {
  let spinnerName = Date.now().toString();
  const spinner = new Spinnies({ spinner: bouncingBall });
  spinner.add(spinnerName, { text: "Building thumbs" });
  let lastFSChange = new Date().getTime();
  watch(imagesRoot, { recursive: true }, (eventType, filename) => {
    if (isMediaUrl(filename)) {
      lastFSChange = new Date().getTime();
    }
  });
  await sleep(10);
  while (true) {
    const albums = await folders("");
    for (const album of albums.reverse()) {
      const m = await media(album, "");
      for (const picture of m.assets) {
        while (!isIdle()) {
          spinner.update(spinnerName, {
            text: `Thumbnail generation paused: system busy`,
          });
          await sleep(1);
        }
        spinner.update(spinnerName, {
          text: `Building thumbnails for album ${album.name}`,
        });
        await Promise.all(
          // All size except large ones
          ThumbnailSizeVals.filter((f) => !f.includes("large")).map((size) =>
            stat(thumbnailPathFromEntryAndSize(picture, size))
              .catch((e) => readOrMakeThumbnail(picture, size))
              .catch((e) => {
                console.error(
                  `An error occured while creating a thumbnail for ${picture.album.key}/${picture.name} : ${e}`
                );
                return;
              })
          )
        );
      }
    }
    spinner.succeed(spinnerName, {
      text: `Scan done - will wait for updates`,
    });
    await sleep(20);
    const now = new Date().getTime();
    while (true) {
      await sleep(1);
      if (lastFSChange > now) break;
    }
    spinnerName = Date.now().toString();
    spinner.add(spinnerName, { text: "Changes detected, rescanning" });
  }
}
