import { Album } from "../../../shared/types/types";
import { addOrRefreshOrDeleteAlbum } from "../../background/bg-walker";
import { broadcast } from "../../utils/socketList";
import { albumWithData } from "./albumUtils";
import { getShortcuts, setPicasaAlbumShortcut } from "./picasaIni";

export async function setAlbumShortcut(album: Album, shortcut: string) {
  const a = albumWithData(album);
  if (!a) {
    throw new Error("Unknown album");
  }
  const previous = getShortcuts()[shortcut];
  await setPicasaAlbumShortcut(album, shortcut);

  if (previous) {
    addOrRefreshOrDeleteAlbum(previous);
  }
  if (shortcut) {
    addOrRefreshOrDeleteAlbum(album);
  }

  broadcast("shortcutsUpdated", {});
  return;
}
