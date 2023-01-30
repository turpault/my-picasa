import { AlbumEntry, ThumbnailSize } from "../../../shared/types/types";
import { readOrMakeThumbnail } from "../rpcFunctions/thumbnail";

export async function thumbnail(
  entry: AlbumEntry,
  size: ThumbnailSize = "th-medium",
  animated: boolean = true
): Promise<{ data: Buffer; mime: string }> {
  const d = await readOrMakeThumbnail(entry, size, animated);
  return d;
}
