import { AlbumEntry, ThumbnailSize } from "../../../shared/types/types";
import { readOrMakeThumbnail } from "../rpcFunctions/thumbnail";

export async function thumbnail(
  entry: AlbumEntry,
  size: ThumbnailSize = "th-medium"
): Promise<Buffer> {
  const d = await readOrMakeThumbnail(entry, size);
  return d.data;
}
