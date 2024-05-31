import Debug from "debug";
import { AlbumEntry, ThumbnailSizeVals } from "../../shared/types/types";
import { imageInfo } from "../imageOperations/info";
import { media } from "../rpc/rpcFunctions/albumUtils";
import { makeThumbnailIfNeeded } from "../rpc/rpcFunctions/thumbnail";
import { folders, waitUntilWalk } from "../walker";
const debug = Debug("app:bg-thumbgen");
export async function buildThumbs() {
  await waitUntilWalk();
  const sizes = ThumbnailSizeVals.filter((f) => !f.includes("large"))
    .map((size) => [
      { size, animated: true },
      { size, animated: false },
    ])
    .flat();
  const albums = await folders("");
  for (const album of albums.reverse()) {
    let m: { entries: AlbumEntry[] };
    try {
      m = await media(album);
    } catch (e) {
      // Yuck folder is gone...
      continue;
    }
    debug("buildThumbs: Processing album", album.name);
    await Promise.all(
      m.entries.map(async (picture) => {
        await imageInfo(picture);
        await Promise.all(
          sizes.map(({ size, animated }) =>
            makeThumbnailIfNeeded(picture, size, animated),
          ),
        );
      }),
    );
  }
}
