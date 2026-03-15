import { Album, Shortcut } from "../../../shared/types/types";
import { events } from "../../../shared/server-events";
import { albumWithData } from "./albumUtils";
import { getShortcuts, getMutations } from "../../services/walker/queries";

export async function setAlbumShortcut(album: Album, shortcut: string) {
  const a = albumWithData(album);
  if (!a) {
    throw new Error("Unknown album");
  }
  const shortcuts = await getShortcuts();
  const previous = shortcuts.find((s) => s.shortcut === shortcut);
  const mutations = getMutations();
  await mutations.updateAlbumShortcut(album, shortcut);

  const albumsToReindex: Album[] = [];
  if (previous) {
    albumsToReindex.push(previous.album);
  }
  if (shortcut) {
    albumsToReindex.push(album);
  }
  if (albumsToReindex.length > 0) {
    events.emit("reindex", albumsToReindex);
  }

  events.emit("shortcutsUpdated", {});
  return;
}
