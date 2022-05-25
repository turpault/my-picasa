import { Album, AlbumEntry } from "../shared/types/types";
import { getService } from "./rpc/connect";

export async function walkFromServer(
  filter: string
): Promise<{ name: string; key: string }[]> {
  const s = await getService();
  return s.folders(filter);
}

export async function albumContents(
  fh: Album,
  filter: string
): Promise<{
  entries: AlbumEntry[];
}> {
  const service = await getService();
  const { entries } = await service.media(fh, filter);
  return { entries };
}
