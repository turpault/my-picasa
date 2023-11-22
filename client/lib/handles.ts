import { getService } from "../rpc/connect";
import { Album, AlbumEntry, AlbumMetaData } from "../../shared/types/types";

export async function toggleStar(entries: AlbumEntry[]): Promise<void> {
  const s = await getService();
  s.toggleStar(entries);
}

export async function getAlbumMetadata(album: Album): Promise<AlbumMetaData> {
  const s = await getService();
  return s.getAlbumMetadata(album);
}
