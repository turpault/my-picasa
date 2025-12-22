export type PartialRecord<K extends keyof any, T> = {
  [P in K]?: T;
};

export type PicasaSection = { [name: string]: string };

export type extraFields =
  | `cached:filters:${ThumbnailSize}`
  | `cached:dimensions:${ThumbnailSize}`
  | `cached:rotate:${ThumbnailSize}`
  | `cached:filters:stats`
  | `originalAlbumName`
  | `originalAlbumKey`
  | `originalName`;
export type AlbumEntryMetaData = {
  dateTaken?: string; // ISO date
  geoPOI?: string; // a JSON-encoded string with a list of POIs around the photo
  latitude?: number;
  longitude?: number;
  exif?: string; // a JSON-encoded string with the EXIF data
  photostar?: boolean; // Starred from MacOS photo app
  star?: boolean;
  starCount?: string;
  caption?: string;
  text?: string;
  textactive?: string;
  dimensions?: string;
  dimensionsFromFilter?: string; // Filters used to generate the dimensions
  rank?: string;
  rotate?: string; // f.e. rotate(angle)
  faces?: string; // f.e. rect64(5a6b0000c28ab778),42d7ff00b9602bb9
  filters?: string; // crop64=1,5a491bc4dd659056;enhance=1;finetune2=1,0.000000,0.000000,0.190877,00000000,0.000000;autolight=1;tilt=1,-0.233232,0.000000;crop64=1,1ef60000fe77df8d;fill=1,0.448598;autolight=1;fill=1,0.177570;finetune2=1,0.000000,0.000000,0.235789,00000000,0.000000;
  stats?: string;
  persons?: string; // a comma-separated list of persons in the picture
} & PartialRecord<extraFields, string>;

export type GeoPOI = {
  loc: string;
  category: string;
  distance: number;
};

export type ReferenceData = {
  hash?: string;
  detection: AlignedRect;
  landmarks: Landmarks;
  unshiftedLandmarks: Landmarks;
  alignedRect: AlignedRect;
  angle: Angle;
  expressions: Expressions;
  gender: string;
  genderProbability: number;
  age: number;
  descriptor: number[];
};

export type AlignedRect = {
  score: number;
  classScore: number;
  className: string;
  box: Box;
  imageDims: ImageDims;
  imageWidth: number;
  imageHeight: number;
  relativeBox: Box;
};

export type Box = {
  x: number;
  y: number;
  width: number;
  height: number;
  left: number;
  top: number;
  right: number;
  bottom: number;
  area: number;
  topLeft: Shift;
  topRight: Shift;
  bottomLeft: Shift;
  bottomRight: Shift;
};

export type Shift = {
  x: number;
  y: number;
};

export type ImageDims = {
  width: number;
  height: number;
};

export type Angle = {
  roll: number;
  pitch: number;
  yaw: number;
};

export type Expressions = {
  neutral: number;
  happy: number;
  sad: number;
  angry: number;
  fearful: number;
  disgusted: number;
  surprised: number;
};

export type Landmarks = {
  shift: Shift;
  imageWidth: number;
  imageHeight: number;
  positions: Shift[];
  relativePositions: Shift[];
};

export type Reference = {
  id: string;
  data: ReferenceData;
};

export type UndoStep = {
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
  progress: { total: number; remaining: number };
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
  BUILD_PROJECT = "Build Project",
  POPULATE_IPHOTO_FAVORITES = "Import Favorites from Photo app",
  TOPAZ_PHOTO_AI = "Topaz Photo AI",
}

export enum ExifTag {
  ApertureValue = "ApertureValue",
  BrightnessValue = "BrightnessValue",
  ColorSpace = "ColorSpace",
  ComponentsConfiguration = "ComponentsConfiguration",
  CreateDate = "CreateDate",
  DateTimeOriginal = "DateTimeOriginal",
  DigitalZoomRatio = "DigitalZoomRatio",
  ExifImageHeight = "ExifImageHeight",
  ExifImageWidth = "ExifImageWidth",
  ExifVersion = "ExifVersion",
  ExposureMode = "ExposureMode",
  ExposureProgram = "ExposureProgram",
  ExposureTime = "ExposureTime",
  FileSource = "FileSource",
  Flash = "Flash",
  FlashpixVersion = "FlashpixVersion",
  FNumber = "FNumber",
  FocalLength = "FocalLength",
  GPSAltitude = "GPSAltitude",
  GPSAltitudeRef = "GPSAltitudeRef",
  GPSDateStamp = "GPSDateStamp",
  GPSImgDirection = "GPSImgDirection",
  GPSImgDirectionRef = "GPSImgDirectionRef",
  GPSLatitude = "GPSLatitude",
  GPSLatitudeRef = "GPSLatitudeRef",
  GPSLongitude = "GPSLongitude",
  GPSLongitudeRef = "GPSLongitudeRef",
  GPSTimeStamp = "GPSTimeStamp",
  ImageUniqueID = "ImageUniqueID",
  ISO = "ISO",
  latitude = "latitude",
  LightSource = "LightSource",
  longitude = "longitude",
  Make = "Make",
  MeteringMode = "MeteringMode",
  Model = "Model",
  ModifyDate = "ModifyDate",
  Orientation = "Orientation",
  ResolutionUnit = "ResolutionUnit",
  SceneCaptureType = "SceneCaptureType",
  SceneType = "SceneType",
  SensingMethod = "SensingMethod",
  ShutterSpeedValue = "ShutterSpeedValue",
  Software = "Software",
  SubjectArea = "SubjectArea",
  SubSecTimeDigitized = "SubSecTimeDigitized",
  SubSecTimeOriginal = "SubSecTimeOriginal",
  WhiteBalance = "WhiteBalance",
  XResolution = "XResolution",
  YResolution = "YResolution",
}
export type ExifData = {
  [key in ExifTag]: any;
};

export const ThumbnailSizeVals = ["th-small", "th-medium", "th-large"] as const;
export type ThumbnailSize = (typeof ThumbnailSizeVals)[number];
export type ImageEncoding = "base64" | "base64url" | "base64urlInfo" | "Buffer";
export type ImageMimeType =
  | "raw"
  | "image/jpeg"
  | "image/png"
  | "image/gif"
  | "image/webp"
  | "image/tiff"
  | "image/heic"
  | "image/heif"
  | "image/heif-sequence"
  | "image/heic-sequence";

export const extensionToMime = {
  "heic": "image/heic",
  "heif": "image/heif",
  "heif-sequence": "image/heif-sequence",
  "heic-sequence": "image/heic-sequence",
  "tiff": "image/tiff",
  "gif": "image/gif",
  "webp": "image/webp",
  "jpeg": "image/jpeg",
  "jpg": "image/jpeg",
  "png": "image/png",
  "raw": "raw",
};
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

export type AlbumWithData = Album & {
  count: number;
  shortcut?: string;
};

const sep = "»";
export function keyFromID(id: string, kind: AlbumKind) {
  return `${kind}${sep}${id}`.normalize();
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
  | "albumRenamed"
  | "albumOrderUpdated"
  | "shortcutsUpdated";
export type AlbumChangeEvent = {
  type: AlbumChangeType;
  album?: AlbumWithData;
  albums?: AlbumWithData[];
  altAlbum?: AlbumWithData;
  added?: AlbumWithData;
  deleted?: AlbumWithData;
  updated?: AlbumWithData;
};

export type Node = {
  name: string;
  childs: Node[];
  albums: AlbumWithData[];
  collapsed: boolean;
};

export type AlbumEntry = {
  name: string;
  album: Album;
};

export type AlbumEntryWithMetadata = AlbumEntry & {
  meta: ImageFileMeta;
};

export type AlbumEntryWithMetadataAndExif = AlbumEntry & {
  metadata: AlbumEntryMetaData;
  exif: ExifData;
};

export type AlbumEntryPicasa = AlbumEntry & {
  metadata: AlbumEntryMetaData;
};

export type AlbumContents = {
  metadata: AlbumMetaData;
  entries: AlbumEntry[];
};

export type FolderEvent = {
  updated: { folders: Album[] };
};

export type Face = { hash: string; rect: string };
export type FaceList = Face[];

export type FaceData = Face & {
  label: string;
  originalEntry: AlbumEntry;
};
export const animatedPictureExtensions = ["gif"];

export const pictureExtensions = [
  "jpeg",
  "jpg",
  "png",
  "heic",
  "bmp",
  "cr2",
  ...animatedPictureExtensions,
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

export type SlideshowProject = AlbumEntry & {
  payload: Slideshow;
};

export type Mosaic = {
  pool: AlbumEntry[];
  images: AlbumEntry[];
  format: Format;
  layout: Layout;
  orientation: Orientation;
  gutter: number;
  root?: Cell;
  size: number;
  seed: number;
};
export const SlideShowTransitionsValues = [
  "slider",
  "fade",
  "smooth",
  "pile",
  "none",
] as const;
export const SlideShowBorderValues = [
  "simple",
  "wide",
  "polaroid",
  "none",
] as const;
export type SlideShowTransitions = (typeof SlideShowTransitionsValues)[number];
export const SlideShowDelayValues = [1, 2, 5, 10] as const;
export type SlideShowDelays = (typeof SlideShowDelayValues)[number];
export type SlideShowPageType = "image" | "text";
export type SlideShowBorderType = (typeof SlideShowBorderValues)[number];
export type SlideshowPage = {
  id: string;
  type: SlideShowPageType;
  entry?: AlbumEntry;
  text?: string;
  textColor?: string;
  bgTextColor?: string;
  delay: SlideShowDelays;
  transition: SlideShowTransitions;
  border: SlideShowBorderType;
};
export type Slideshow = {
  pages: SlideshowPage[];
};

export enum Layout {
  MOSAIC,
  SQUARE,
}

export enum ProjectType {
  MOSAIC = "Mosaic",
  SLIDESHOW = "Slideshow",
}

export type Contact = {
  originalName: string;
  email: string;
  something: string;
  key: string;
};

export type ContactByHash = {
  [hash: string]: Contact;
};

export type Bug = {
  description: string;
  priority: number;
  status: string;
  created: Date;
};

export type Filters = {
  star: number;
  video: boolean;
  people: boolean;
  persons: string[];
  location: boolean;
  isFavoriteInIPhoto: boolean;
  text: string;
  // Additional filtering options
  hasFaces?: boolean;
  hasGeoLocation?: boolean;
  minStarCount?: number;
};