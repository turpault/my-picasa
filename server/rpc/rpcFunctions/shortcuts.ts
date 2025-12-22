import { Album } from "../../../shared/types/types";
import { events } from "../../events/server-events";
import { broadcast } from "../../utils/socketList";
import { albumWithData } from "./albumUtils";
import { getShortcuts, setPicasaAlbumShortcut } from "./picasa-ini";

export async function setAlbumShortcut(album: Album, shortcut: string) {
  const a = albumWithData(album);
  if (!a) {
    throw new Error("Unknown album");
  }
  const previous = getShortcuts()[shortcut];
  await setPicasaAlbumShortcut(album, shortcut);

  const albumsToReindex: Album[] = [];
  if (previous) {
    albumsToReindex.push(previous);
  }
  if (shortcut) {
    albumsToReindex.push(album);
  }
  if (albumsToReindex.length > 0) {
    events.emit("reindex", albumsToReindex);
  }

  broadcast("shortcutsUpdated", {});
  return;
}
