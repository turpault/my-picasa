import { join } from "path";
import { env } from "process";

// Should be made configurable
export const realImagesRoot = "/Volumes/Photos/Photos";
export const imagesRoot = process.env.PICISA_PICTURE_FOLDER || realImagesRoot;
export const facesFolder = join(imagesRoot, "faces");
export const favoritesFolder = join(imagesRoot, "favorites");
export const exportsFolder = join(imagesRoot, "exports");
export const projectFolder = join(imagesRoot, "projects");
export const bugsFolder = join(imagesRoot, ".bugs");

export const specialFolders = [
  facesFolder,
  favoritesFolder,
  exportsFolder,
  projectFolder,
  bugsFolder,
];

export const defaultNewFolder = new Date().getFullYear().toString();
export const PICASA = ".picasa.ini";
export const THUMBS = ".thumbnails.ini";

// TODO Figure out the actual path of the photo library
export const PhotoLibraryPath =
  "/Volumes/1TB USB/Phototheque MacOS/Photothèque.photoslibrary";
export const ProjectOutputFolder = join(
  defaultNewFolder,
  new Date().getFullYear().toString() + " Mosaic Projects",
);
export const ThumbnailSizes = {
  "th-small": 100,
  "th-medium": 250,
  "th-large": 500,
};

export const Features = {
  faces: env.FACES || false,
};
