import { stat } from "fs/promises";
import Spinnies from "spinnies";
import { sleep } from "../../../shared/lib/utils.js";
import { ThumbnailSizeVals } from "../../../shared/types/types.js";
import { isIdle } from "../../utils/busy.js";
import { readOrMakeThumbnail } from "../rpcFunctions/thumbnail.js";
import { thumbnailPathFromEntryAndSize } from "../rpcFunctions/thumbnailCache.js";
import { folders, media } from "../rpcFunctions/walker.js";

export async function buildThumbs() {
  const spinner = new Spinnies();
  spinner.add("s", { text: "Building thumbs" });
  await sleep(10);

  while (true) {
    const albums = await folders("");
    for (const album of albums) {
      const m = await media(album, "");
      for (const picture of m.assets) {
        while (!isIdle()) {
          spinner.update("s", {
            text: `Thumbnail generation paused: system busy`,
          });
          await sleep(1);
        }
        spinner.update("s", {
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
    await sleep(10);
    console.info("Recannning for thumbs");
  }
}
