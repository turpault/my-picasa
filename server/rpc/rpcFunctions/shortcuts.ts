import { Album } from "../../../shared/types/types";
import { events } from "../../events/server-events";
import { broadcast } from "../../utils/socketList";
import { albumWithData } from "./albumUtils";
import { getShortcuts, getMutations } from "../../services/walker/queries";

export async function setAlbumShortcut(album: Album, shortcut: string) {
  const a = albumWithData(album);
  if (!a) {
    throw new Error("Unknown album");
  }
  const previous = getShortcuts()[shortcut];
  const mutations = getMutations();
  await mutations.updateAlbumShortcut(album, shortcut);

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
