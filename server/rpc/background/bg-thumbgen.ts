import { bouncingBall } from "cli-spinners";
import { watch } from "fs";
import { stat } from "fs/promises";
import Spinnies from "spinnies";
import { isMediaUrl, sleep } from "../../../shared/lib/utils";
import { ThumbnailSizeVals } from "../../../shared/types/types";
import { isIdle } from "../../utils/busy";
import { imagesRoot } from "../../utils/constants";
import { imageInfo } from "../imageOperations/info";
import { media } from "../rpcFunctions/media";
import { readOrMakeThumbnail } from "../rpcFunctions/thumbnail";
import { thumbnailPathFromEntryAndSize } from "../rpcFunctions/thumbnailCache";
import { folders } from "../rpcFunctions/walker";

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
      await sleep(1);
      const m = await media(album, "");
      for (const picture of m.assets) {
        /*while (!isIdle()) {
          spinner.update(spinnerName, {
            text: `Thumbnail generation paused: system busy`,
          });
          await sleep(1);
        }*/
        spinner.update(spinnerName, {
          text: `Building thumbnails for album ${album.name}`,
        });
        await imageInfo(picture);
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
