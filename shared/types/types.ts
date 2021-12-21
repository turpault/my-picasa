import { Emitter } from "../lib/event";

export type PartialRecord<K extends keyof any, T> = {
  [P in K]?: T;
};

export type extraFields =
  | `cached:filters:${ThumbnailSize}`
  | `cached:dimensions:${ThumbnailSize}`;
export type PicasaFileMeta = {
  dateTaken?: string; // ISO date
  star?: boolean;
  caption?: string;
  text?: string;
  textactive?: string;
  rotate?: string; // f.e. rotate(angle)
  faces?: string; // f.e. rect64(5a6b0000c28ab778),42d7ff00b9602bb9
  filters?: string; // crop64=1,5a491bc4dd659056;enhance=1;finetune2=1,0.000000,0.000000,0.190877,00000000,0.000000;autolight=1;tilt=1,-0.233232,0.000000;crop64=1,1ef60000fe77df8d;fill=1,0.448598;autolight=1;fill=1,0.177570;finetune2=1,0.000000,0.000000,0.235789,00000000,0.000000;
} & PartialRecord<extraFields, string>;

export type undoStep = { description: string; uuid: string };
export type Job = {
  id: string;
  name: string;
  data: { source?: AlbumEntry[] | Album; destination?: Album | Album[] };
  status: "started" | "queued" | "finished";
  progress: { start: number; remaining: number };
  errors: string[];
  changed: Function;
};

export const ThumbnailSizeVals = ["th-small", "th-medium", "th-large"] as const;
export type ThumbnailSize = typeof ThumbnailSizeVals[number];

export type ImageFileMeta = {
  width: number;
  height: number;
  data: string;
  transform: string | undefined;
};

export type ImageFileMetas = {
  [key in ThumbnailSize]: ImageFileMeta;
};

export type PicasaFolderMeta = {
  [name: string]: PicasaFileMeta;
};
export type FolderPixels = {
  [name: string]: ImageFileMeta;
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

export type AlbumEntry = {
  name: string;
  album: Album;
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
