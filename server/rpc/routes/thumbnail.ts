import { AlbumEntry, ThumbnailSize } from "../../../shared/types/types";
import { readOrMakeThumbnail } from "../rpcFunctions/thumbnail";

export async function thumbnail(
  entry: AlbumEntry,
  size: ThumbnailSize = "th-medium"
): Promise<Buffer> {
  const d = await readOrMakeThumbnail(entry, size);
  const rawBase64 = d.data.split("base64,").pop()!;
  return Buffer.from(rawBase64, "base64");
}
