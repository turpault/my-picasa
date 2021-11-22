import { AlbumEntry, ThumbnailSize } from "../../../shared/types/types.js";
import { readOrMakeThumbnail } from "../rpcFunctions/thumbnail.js";

export async function thumbnail(
  entry: AlbumEntry,
  size: ThumbnailSize = "th-medium"
): Promise<{ data: Buffer; mime: string }> {
  const d = await readOrMakeThumbnail(entry, size);
  return d;
}
