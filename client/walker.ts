import { Album, AlbumEntry } from "../shared/types/types.js";
import { getService } from "./rpc/connect.js";

export async function walkFromServer(): Promise<
  { name: string; key: string }[]
> {
  const s = await getService();
  return s.folders();
}

export async function albumContents(
  fh: Album
): Promise<{
  pictures: AlbumEntry[];
  videos: AlbumEntry[];
}> {
  const service = await getService();
  const { pictures, videos } = await service.media(fh);
  return { pictures, videos };
}
