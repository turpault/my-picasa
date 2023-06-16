import { join } from "path";

// Should be made configurable
export const realImagesRoot = "/Volumes/Photos/Photos";
export const imagesRoot = process.env.PICISA_PICTURE_FOLDER || realImagesRoot;

export const defaultNewFolder = new Date().getFullYear().toString();
export const PICASA = ".picasa.ini";
export const THUMBS = ".thumbnails.ini";
export const exportsRoot = "/tmp";

// TODO Figure out the actual path of the photo library
export const PhotoLibraryPath =
  "/Volumes/1TB USB/Phototheque MacOS/Photothèque.photoslibrary";
export const ProjectOutputFolder = join(
  defaultNewFolder,
  new Date().getFullYear().toString() + " Mosaic Projects"
);
export const ThumbnailSizes = {
  "th-small": 100,
  "th-medium": 250,
  "th-large": 500,
};
