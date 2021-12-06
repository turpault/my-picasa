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
  assets: AlbumEntry[];
}> {
  const service = await getService();
  const { assets } = await service.media(fh, filter);
  return { assets };
}
