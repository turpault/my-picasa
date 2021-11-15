import { sleep } from "../../../shared/lib/utils";
import { ThumbnailSizeVals } from "../../../shared/types/types";
import { readOrMakeThumbnail } from "../rpcFunctions/thumbnail";
import { folders, mediaInAlbum, walk } from "../rpcFunctions/walker";

export async function buildThumbs() {
  await sleep(6000);
  while (true) {
    const albums = await folders();
    for (const album of albums) {
      const media = await mediaInAlbum(album);
      for (const picture of media.pictures) {
        await Promise.all(
          ThumbnailSizeVals.map((size) =>
            readOrMakeThumbnail(picture, size).catch((e) => {
              console.error(
                `An error occured while resizing image ${picture.album.key}/${picture.name} : ${e}`
              );
              return;
            })
          )
        );
        //await sleep(1);
      }
    }
    await sleep(10);
    console.info("Recannning for thumbs");
  }
}
