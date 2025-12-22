import { clearInterval } from "timers";
import { Queue } from "../../shared/lib/queue";
import { AlbumEntry } from "../../shared/types/types";
import { exifData } from "../../rpc/rpcFunctions/exif";
import { indexingReady, getAllFolders, getAlbumEntries } from "../indexing/worker";
import debug from "debug";
import { waitUntilIdle } from "../../utils/busy";
import { isPicture } from "../../../shared/lib/utils";
import { getPicasaEntry } from "../../rpc/rpcFunctions/picasa-ini";

const debugLogger = debug("app:bg-exif");

export async function populateExifData() {
  const q = new Queue(3);
  await indexingReady();
  const albums = getAllFolders();
  await Promise.all(
    albums.map(async (album) => {
      let entries: AlbumEntry[];
      try {
        entries = await getAlbumEntries(album);
      } catch (e) {
        // Yuck folder is gone...
        return;
      }
      entries.forEach(async (entry) => {
        if (isPicture(entry)) {
          const meta = await getPicasaEntry(entry);
          if (meta.exif) {
            return;
          }
          q.add(async () => {
            debugLogger(`exif data for ${entry.name} missing`);
            await exifData(entry, false);
            await waitUntilIdle(
            );
          });
        }
      });
    })
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
