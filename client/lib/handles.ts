import { getService } from "../rpc/connect.js";
import { Album, AlbumEntry, PicasaFolderMeta } from "../types/types.js";

export async function toggleStar(entries: AlbumEntry[]) {
  return getService().then((service) =>
    Promise.all(
      entries.map((entry) => service.updatePicasaEntry(entry, "star", "toggle"))
    )
  );
}

export async function readPicasaIni(entry: Album): Promise<PicasaFolderMeta> {
  const s = await getService();
  return s.readPicasaIni(entry);
}
