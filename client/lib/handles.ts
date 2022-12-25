import { getService } from "../rpc/connect";
import { Album, AlbumEntry, AlbumMetaData } from "../../shared/types/types";

export async function toggleStar(entries: AlbumEntry[]): Promise<boolean> {
  const picInit = await readAlbumMetadata(entries[0].album);
  const target = !picInit[entries[0].name].star;
  const service = await getService();

  await Promise.all(
    entries.map((entry) => service.updatePicasaEntry(entry, "star", target ? true : null))
  );
  return target;
}

export async function readAlbumMetadata(album: Album): Promise<AlbumMetaData> {
  const s = await getService();
  return s.readAlbumMetadata(album);
}
