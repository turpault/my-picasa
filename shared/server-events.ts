import { buildEmitter } from "./lib/event";
import { Album, AlbumChangeEvent, AlbumEntry, AlbumEntryPicasa, AlbumEntryWithMetadata, AlbumWithData, Job, UndoStep } from "./types/types";

export type ServerEvents = {
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
  picasaEntryUpdated: {
    entry: AlbumEntryPicasa;
    field: string;
    value: any;
  };
  albumEntryAdded: AlbumEntry;
  albumEntryRemoved: AlbumEntry;
  albumEntryUpdated: AlbumEntryWithMetadata;
  albumAdded: AlbumWithData;
  albumRemoved: Album;
  albumUpdated: AlbumWithData;
  reindex: Album[];
  exifDataProcessed: AlbumEntry;
  geoDataFound: AlbumEntry;
  shortcutsUpdated: {};
  projectsUpdated: {
    project: AlbumEntry;
    changeType: string;
  };
  albumEntryAspectChanged: AlbumEntryPicasa;
  albumEvent: AlbumChangeEvent[];
  jobDeleted: Job;
  jobChanged: Job;
  jobFinished: Job;
  undoChanged: {
    undoSteps: UndoStep[];
  };
};

export const events = buildEmitter<ServerEvents>();
