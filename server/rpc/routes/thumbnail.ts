import { Album, AlbumEntry, ThumbnailSize } from "../../../shared/types/types";
import { media } from "../rpcFunctions/albumUtils";
import { readOrMakeThumbnail } from "../rpcFunctions/thumbnail";

export async function thumbnail(
  entry: AlbumEntry,
  size: ThumbnailSize = "th-medium",
  animated: boolean = true
): Promise<{ data: Buffer; mime: string }> {
  const d = await readOrMakeThumbnail(entry, size, animated);
  return d;
}

export async function albumThumbnail(
  album: Album,
  size: ThumbnailSize = "th-medium",
  animated: boolean = true
): Promise<{ data: Buffer; mime: string }> {
  const entries = await media(album);
  const entry =
    entries.entries[Math.floor(Math.random() * entries.entries.length)];
  return readOrMakeThumbnail(entry, size, animated);
}
