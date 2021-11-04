import { Album, AlbumEntry } from "../shared/types/types.js";
import { getService } from "./rpc/connect.js";

export async function walkFromServer(): Promise<
  { name: string; key: string }[]
> {
  const s = await getService();
  return s.folders();
}

export async function folderContents(
  fh: Album
): Promise<{
  pictures: string[];
  videos: string[];
}> {
  const service = await getService();
  const { pictures, videos } = await service.media(fh.key);
  return { pictures, videos };
}
