export type PartialRecord<K extends keyof any, T> = {
  [P in K]?: T;
};

export type PicasaSection = { [name: string]: string };

export type extraFields =
  | `cached:filters:${ThumbnailSize}`
  | `cached:dimensions:${ThumbnailSize}`;
export type AlbumEntryMetaData = {
  dateTaken?: string; // ISO date
  geoPOI?: string; // a JSON-encoded string with a list of POIs around the photo
  latitude?: number;
  longitude?: number;
  exif?: string; // a JSON-encoded string with the EXIF data
  star?: boolean;
  starCount?: string;
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
  completion: Function;
  awaiter: () => Promise<any>;
  out: any;
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
  EXPORT_TO_IPHOTO = "Export All Favorites",
  BUILD_PROJECT = "Build Project",
}

export const ThumbnailSizeVals = ["th-small", "th-medium", "th-large"] as const;
export type ThumbnailSize = typeof ThumbnailSizeVals[number];
export type ImageEncoding = "base64" | "base64url" | "base64urlInfo" | "Buffer";
export type ImageMimeType =
  | "raw"
  | "image/jpeg"
  | "image/png"
  | "image/gif"
  | "image/webp"
  | "image/tiff";
export type ImageFileMeta = {
  type: Filetype;
  width: number;
  height: number;
  transform: string | undefined;
};

export type AlbumMetaData =
  | {
      [name: string]: AlbumEntryMetaData;
    }
  | {
      [name: string]: PicasaSection;
    };

export type ActiveImageEvent = {
  changed: AlbumEntryPicasa;
};

export type SliderEvent = {
  value: number;
};

export enum AlbumKind {
  PROJECT = "project",
  FOLDER = "folder",
  FACE = "face",
}

export type Album = {
  name: string;
  key: string;
  kind: AlbumKind;
};

export type AlbumWithData = Album & { count: number; shortcut?: string };

const sep = "»";
export function keyFromID(id: string, kind: AlbumKind) {
  return `${kind}${sep}${id}`;
}

export function idFromKey(key: string): { id: string; kind: AlbumKind } {
  const [kind, id] = key.split(sep);
  return { id, kind: kind as AlbumKind };
}

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
  metadata: AlbumEntryMetaData;
};

export type AlbumInfo = {
  metadata: AlbumMetaData;
  assets: AlbumEntry[];
};

export type FolderEvent = {
  updated: { folders: Album[] };
};

export type FaceData = {
  album: Album;
  hash: string;
  rect: string;
  label: string;
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
  F10x8 = 10 / 8,
  F6x4 = 6 / 4,
  F5x5 = 5 / 5,
  F16x9 = 16 / 9,
}

export enum MosaicSizes {
  "HD" = 1920,
  "4K" = 3840,
  "8K" = 7680,
}

export enum GutterSizes {
  "None" = 0,
  "Small" = 1,
  "Medium" = 2,
  "Large" = 4,
}

export type Cell = {
  id: string;
  split: "v" | "h";
  image?: AlbumEntryWithMetadata;
  weight: number;
  childs?: {
    left: Cell;
    right: Cell;
  };
};

export type MosaicProject = AlbumEntry & {
  payload: Mosaic;
};

export type Mosaic = {
  pool: AlbumEntryWithMetadata[];
  images: AlbumEntryWithMetadata[];
  format: Format;
  layout: Layout;
  orientation: Orientation;
  gutter: number;
  root?: Cell;
  size: number;
  seed: number;
};

export enum Layout {
  MOSAIC,
  SQUARE,
}

export enum ProjectType {
  MOSAIC = "Mosaic",
}
