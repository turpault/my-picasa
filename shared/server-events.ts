import { buildEmitter } from "./lib/event";
import { Album, AlbumChangeEvent, AlbumEntry, AlbumEntryPicasa, AlbumEntryWithMetadata, AlbumWithData, Contact, Job, Project, UndoStep } from "./types/types";

/**
 * Server event types. Emitted by walker, mutations, RPC handlers, and other services.
 * Global job schedulers listen to these to enqueue EXIF, thumbnail, face, and favorite-export jobs.
 */
export type ServerEvents = {
  /** User toggled star/favorite on an entry. Triggers favorite export. */
  favoriteChanged: {
    entry: AlbumEntryPicasa;
  };
  /** Entry filters (crop, adjustments) changed. Triggers thumbnail rebuild. */
  filtersChanged: {
    entry: AlbumEntryPicasa;
  };
  /** Entry rotation changed. Triggers thumbnail rebuild. */
  rotateChanged: {
    entry: AlbumEntryPicasa;
  };
  /** Entry caption changed. Triggers search index update. */
  captionChanged: {
    entry: AlbumEntryPicasa;
  };
  /** A picasa metadata field was updated (star, caption, persons, etc.). Triggers search index and favorite export. */
  picasaEntryUpdated: {
    entry: AlbumEntryPicasa;
    field: string;
    value: any;
  };
  /** New file detected in an album. Triggers EXIF, thumbnail, face, favorite export. */
  albumEntryAdded: AlbumEntry;
  /** File stats (mtime/size) differ from cache – binary or metadata changed. Triggers EXIF, thumbnail, face. */
  albumEntryFileChanged: AlbumEntry;
  /** Entry was renamed or moved within the album. */
  albumEntryMoved: { oldEntry: AlbumEntry; newEntry: AlbumEntry };
  /** File removed from album. Triggers removal from EXIF, geo, search DBs. */
  albumEntryRemoved: AlbumEntry;
  /** Entry metadata (dimensions, imageInfo) updated. Used by client caches. */
  albumEntryUpdated: AlbumEntryWithMetadata;
  /** New album discovered on disk. */
  albumAdded: AlbumWithData;
  /** Album deleted from disk. */
  albumRemoved: Album;
  /** Album metadata or entries changed. */
  albumUpdated: AlbumWithData;
  /** Request to reindex these albums (e.g. after file operations). */
  reindex: Album[];
  /** EXIF extraction completed for an entry. Triggers geo POI and search index. */
  exifDataProcessed: AlbumEntry;
  /** Geo POI data found for an entry. Triggers search index geo update. */
  geoDataFound: AlbumEntry;
  /** Shortcut definitions changed. */
  shortcutsUpdated: {};
  /** Project created, updated, or deleted. */
  projectsUpdated: {
    project: Project;
    changeType: string;
  };
  /** Entry aspect/dimensions changed (e.g. after crop). */
  albumEntryAspectChanged: AlbumEntryPicasa;
  /** Batch of album change notifications for client sync. */
  albumEvent: AlbumChangeEvent[];
  /** Person/contact face images list changed. */
  personImagesChanged: { person: Contact };
  /** File job deleted. */
  jobDeleted: Job;
  /** File job state changed. */
  jobChanged: Job;
  /** File job finished. */
  jobFinished: Job;
  /** Undo stack changed. */
  undoChanged: {
    undoSteps: UndoStep[];
  };
  /** User settings changed. */
  settingsChanged: {};
};

export const events = buildEmitter<ServerEvents>();
