import { buildEmitter } from "./lib/event";
import { Album, AlbumChangeEvent, AlbumEntry, AlbumEntryPicasa, AlbumEntryWithMetadata, AlbumWithData, Contact, Job, Project, UndoStep } from "./types/types";

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
  /** Emitted when file stats (mtime/size) differ from cached - triggers EXIF, thumbnail reprocessing */
  albumEntryFileChanged: AlbumEntry;
  albumEntryMoved: { oldEntry: AlbumEntry; newEntry: AlbumEntry };
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
    project: Project;
    changeType: string;
  };
  albumEntryAspectChanged: AlbumEntryPicasa;
  albumEvent: AlbumChangeEvent[];
  personImagesChanged: { person: Contact };
  jobDeleted: Job;
  jobChanged: Job;
  jobFinished: Job;
  undoChanged: {
    undoSteps: UndoStep[];
  };
  settingsChanged: {};
};

export const events = buildEmitter<ServerEvents>();
