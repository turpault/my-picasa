import { Album } from "../../../shared/types/types";
import { addOrRefreshOrDeleteAlbum } from "../../walker";
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

  if (previous) {
    addOrRefreshOrDeleteAlbum(previous, undefined, true);
  }
  if (shortcut) {
    addOrRefreshOrDeleteAlbum(album, undefined, true);
  }

  broadcast("shortcutsUpdated", {});
  return;
}
