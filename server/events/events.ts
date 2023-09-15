import { buildEmitter } from "../../shared/lib/event";
import { AlbumEntry } from "../../shared/types/types";
type ServerEvents = {
  favoriteChanged: {
    entry: AlbumEntry;
    starCount: number;
  };
};

export const events = buildEmitter<ServerEvents>();
