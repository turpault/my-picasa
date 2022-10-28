import { Album, AlbumEntry, AlbumWithCount } from "../shared/types/types";
import { getService } from "./rpc/connect";

export async function filteredAlbums(
  filter: string
): Promise<AlbumWithCount[]> {
  const s = await getService();
  return s.folders(filter);
}

export async function albumContents(
  fh: Album,
): Promise<{
  entries: AlbumEntry[];
}> {
  const service = await getService();
  const { entries } = await service.media(fh);
  return { entries };
}
