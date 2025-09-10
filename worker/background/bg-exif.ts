import { clearInterval } from "timers";
import { Queue } from "../../shared/lib/queue";
import { AlbumEntry } from "../../shared/types/types";
import { media } from "../../server/rpc/rpcFunctions/albumUtils";
import { exifData } from "../../server/rpc/rpcFunctions/exif";
import { getFolderAlbums, waitUntilWalk } from "../../server/walker";
import debug from "debug";

const debugLogger = debug("app:bg-exif");

export async function populateExifData() {
  const q = new Queue(10);
  await Promise.all([waitUntilWalk()]);
  const albums = await getFolderAlbums();
  await Promise.all(
    albums.map(async (album) => {
      let m: { entries: AlbumEntry[] };
      try {
        m = await media(album);
      } catch (e) {
        // Yuck folder is gone...
        return;
      }
      m.entries.map(async (entry) => q.add(() => exifData(entry, false)));
    }),
  );
  const t = setInterval(() => {
    if (q.total() > 0)
      debugLogger(
        `buildExifData: Queue progress: ${Math.floor((q.done() * 100) / q.total())}% (${q.done()} done)`,
      );
  }, 2000);
  await q.drain();
  clearInterval(t);
}
