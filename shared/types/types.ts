export type PartialRecord<K extends keyof any, T> = {
  [P in K]?: T;
};

export type PicasaSection = { [name: string]: string };

export type extraFields =
  | `cached:filters:${ThumbnailSize}`
  | `cached:dimensions:${ThumbnailSize}`;
export type PicasaFileMeta = {
  dateTaken?: string; // ISO date
  star?: boolean;
  caption?: string;
  text?: string;
  textactive?: string;
  dimensions?: string;
  dimensionsFromFilter?: string;
  rank?: string;
  rotate?: string; // f.e. rotate(angle)
  faces?: string; // f.e. rect64(5a6b0000c28ab778),42d7ff00b9602bb9
  filters?: string; // crop64=1,5a491bc4dd659056;enhance=1;finetune2=1,0.000000,0.000000,0.190877,00000000,0.000000;autolight=1;tilt=1,-0.233232,0.000000;crop64=1,1ef60000fe77df8d;fill=1,0.448598;autolight=1;fill=1,0.177570;finetune2=1,0.000000,0.000000,0.235789,00000000,0.000000;
} & PartialRecord<extraFields, string>;

export type undoStep = {
  description: string;
  uuid: string;
  timestamp: number;
  operation: string;
  payload: object;
};
export type JobData = {
  source: AlbumEntry[] | Album | any[];
  destination: any;
  noUndo?: boolean;
  name?: string;
  argument?: any;
};
export type Job = {
  id: string;
  name: string;
  data: JobData;
  status: "started" | "queued" | "finished";
  progress: { start: number; remaining: number };
  errors: string[];
  changed: Function;
};

export enum JOBNAMES {
  MOVE = "Move",
  MULTI_MOVE = "Multi move",
  COPY = "Copy",
  DUPLICATE = "Duplicate",
  EXPORT = "Export",
  DELETE = "Delete",
  RESTORE = "Restore",
  DELETE_ALBUM = "Delete Album",
  RESTORE_ALBUM = "Restore Album",
  RENAME_ALBUM = "Rename Album",
  EXPORT_TO_IPHOTO = "Export...",
}

export const ThumbnailSizeVals = ["th-small", "th-medium", "th-large"] as const;
export type ThumbnailSize = typeof ThumbnailSizeVals[number];

export type ImageFileMeta = {
  type: Filetype;
  width: number;
  height: number;
  transform: string | undefined;
};

export type PicasaFolderMeta =
  | {
      [name: string]: PicasaFileMeta;
    }
  | {
      [name: string]: PicasaSection;
    };

export type ActiveImageEvent = {
  changed: AlbumEntry;
};

export type SliderEvent = {
  value: number;
};

export type Album = {
  name: string;
  key: string;
};

export type FaceAlbum = Album & {};


export type AlbumWithData = Album & { shortcut?: string; count: number };

export type AlbumChangeType =
  | "albums"
  | "albumDeleted"
  | "albumAdded"
  | "albumInfoUpdated"
  | "albumMoved"
  | "albumOrderUpdated"
  | "shortcutsUpdated";
export type AlbumChangeEvent = {
  type: AlbumChangeType;
  album?: AlbumWithData;
  albums?: AlbumWithData[];
  altAlbum?: AlbumWithData;
};

export type AlbumEntry = {
  name: string;
  album: Album;
};
export type AlbumEntryWithMetadata = AlbumEntry & {
  meta: ImageFileMeta;
};

export type AlbumEntryPicasa = AlbumEntry & {
  picasa: PicasaFileMeta;
};

export type AlbumInfo = {
  picasa: PicasaFolderMeta;
  assets: AlbumEntry[];
};

export type FolderEvent = {
  updated: { folders: Album[] };
};

export const pictureExtensions = [
  "jpeg",
  "jpg",
  "png",
  "gif",
  "heic",
  "bmp",
  "cr2",
];
export const videoExtensions = ["mp4", "mov", "m4v"];
export enum Filetype {
  Picture = "image",
  Video = "video",
}

export enum Orientation {
  PORTRAIT,
  PAYSAGE,
}

export enum Format {
  F10x8,
  F6x4,
  F5x5,
  F16x9,
}
