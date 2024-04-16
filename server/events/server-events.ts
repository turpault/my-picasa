import { buildEmitter } from "../../shared/lib/event";
import { AlbumEntryPicasa } from "../../shared/types/types";
type ServerEvents = {
  favoriteChanged: {
    entry: AlbumEntryPicasa;
  };
  filtersChanged: {
    entry: AlbumEntryPicasa;
  };
  rotateChanged: {
    entry: AlbumEntryPicasa;
  };
  captionChanged: {
    entry: AlbumEntryPicasa;
  };
};

export const events = buildEmitter<ServerEvents>();
